import { randomUUID } from "node:crypto"
import { createServer } from "node:http"
import { WebSocket, WebSocketServer } from "ws"

import {
  MAX_MESSAGE_BYTES,
  PROTOCOL_VERSION,
  durableAcknowledgement,
  validateAuthMessage,
  validateScanMessage,
  verifyAudienceToken,
} from "./protocol.mjs"

const AUTH_TIMEOUT_MS = 5_000
const UPSTREAM_TIMEOUT_MS = 20_000
const HEARTBEAT_MS = 15_000
const MAX_BUFFERED_BYTES = 256 * 1024
const RATE_WINDOW_MS = 1_000
const MAX_SCANS_PER_WINDOW = 5

function send(socket, message) {
  if (socket.readyState !== WebSocket.OPEN || socket.bufferedAmount > MAX_BUFFERED_BYTES) return false
  socket.send(JSON.stringify({ v: PROTOCOL_VERSION, ...message }))
  return true
}

async function jsonResponse(response) {
  const text = await response.text()
  if (Buffer.byteLength(text) > 64 * 1024) return { error: "Upstream response too large" }
  try {
    const value = JSON.parse(text)
    return value && typeof value === "object" && !Array.isArray(value) ? value : { error: "Invalid upstream response" }
  } catch {
    return { error: "Invalid upstream response" }
  }
}

async function upstreamPost(baseUrl, apiKey, payload, timeoutMs) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(`${baseUrl}/api/qr-biometric-icc`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": apiKey },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })
    return { status: response.status, body: await jsonResponse(response) }
  } catch (error) {
    return { status: 0, body: { error: error instanceof Error ? error.message : "Upstream unavailable" } }
  } finally {
    clearTimeout(timeout)
  }
}

export function createRelayServer({
  upstreamBaseUrl,
  tokenSecret,
  port = 8080,
  host = "0.0.0.0",
  skipScannerOnlineCheck = false,
  allowInsecureUpstream = false,
  authTimeoutMs = AUTH_TIMEOUT_MS,
  upstreamTimeoutMs = UPSTREAM_TIMEOUT_MS,
  logger = console,
}) {
  if (!upstreamBaseUrl) throw new Error("UPSTREAM_BASE_URL is required")
  if (!tokenSecret || Buffer.byteLength(tokenSecret) < 32) throw new Error("RELAY_TOKEN_SECRET must contain at least 32 bytes")
  let parsedBaseUrl
  try {
    parsedBaseUrl = new URL(upstreamBaseUrl)
  } catch {
    throw new Error("UPSTREAM_BASE_URL must be a valid HTTPS URL")
  }
  if (parsedBaseUrl.protocol !== "https:" && !allowInsecureUpstream) throw new Error("UPSTREAM_BASE_URL must use HTTPS")
  if (parsedBaseUrl.username || parsedBaseUrl.password || parsedBaseUrl.search || parsedBaseUrl.hash) throw new Error("UPSTREAM_BASE_URL must not contain credentials, query, or fragment")
  const baseUrl = parsedBaseUrl.toString().replace(/\/$/, "")
  const metrics = { connections: 0, scanners: 0, audiences: 0, durableAcks: 0, upstreamFailures: 0 }
  const audiences = new Set()
  const scanners = new Map()
  const states = new WeakMap()

  const httpServer = createServer((request, response) => {
    if (request.method === "GET" && request.url === "/health") {
      response.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" })
      response.end(JSON.stringify({ status: "ready", protocolVersion: PROTOCOL_VERSION }))
      return
    }
    if (request.method === "GET" && request.url === "/metrics") {
      response.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" })
      response.end(JSON.stringify(metrics))
      return
    }
    response.writeHead(404).end()
  })
  const webSockets = new WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE_BYTES, perMessageDeflate: false })

  httpServer.on("upgrade", (request, socket, head) => {
    const path = new URL(request.url ?? "/", "http://relay.local").pathname
    if (path !== "/v1/realtime") {
      socket.write("HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n")
      socket.destroy()
      return
    }
    webSockets.handleUpgrade(request, socket, head, (client) => webSockets.emit("connection", client, request))
  })

  webSockets.on("connection", (socket) => {
    metrics.connections++
    const state = { authenticated: false, role: null, processing: false, alive: true, scanTimes: [] }
    states.set(socket, state)
    const authTimeout = setTimeout(() => socket.close(4001, "Authentication timeout"), authTimeoutMs)

    socket.on("pong", () => { state.alive = true })
    socket.on("error", (error) => logger.warn?.("WebSocket client error", error.message))
    socket.on("close", () => {
      clearTimeout(authTimeout)
      if (state.role === "scanner" && scanners.get(state.deviceId) === socket) scanners.delete(state.deviceId)
      if (state.role === "dashboard" || state.role === "display") audiences.delete(socket)
      metrics.scanners = scanners.size
      metrics.audiences = audiences.size
    })

    socket.on("message", async (data, binary) => {
      if (binary || data.length > MAX_MESSAGE_BYTES || state.processing) {
        if (!state.processing) socket.close(4002, "Invalid message")
        else send(socket, { type: "error", code: "busy", retryable: true })
        return
      }
      let message
      try {
        message = JSON.parse(data.toString())
      } catch {
        socket.close(4002, "Invalid JSON")
        return
      }

      if (!state.authenticated) {
        state.processing = true
        try {
          const auth = validateAuthMessage(message)
          if (!auth.ok) return socket.close(4003, auth.error)
          clearTimeout(authTimeout)
          if (auth.value.role === "scanner") {
            if (!skipScannerOnlineCheck) {
              const verified = await upstreamPost(baseUrl, auth.value.apiKey, {
                event: "device-online",
                deviceId: auth.value.deviceId,
                macAddress: auth.value.macAddress,
              }, upstreamTimeoutMs)
              if (verified.status < 200 || verified.status >= 300 || verified.body?.success !== true) {
                return socket.close(4003, "Scanner authentication failed")
              }
            }
            if (socket.readyState !== WebSocket.OPEN) return
            const previous = scanners.get(auth.value.deviceId)
            if (previous && previous !== socket) previous.close(4004, "Superseded connection")
            Object.assign(state, auth.value)
            scanners.set(auth.value.deviceId, socket)
            metrics.scanners = scanners.size
          } else {
            if (!verifyAudienceToken(auth.value.token, tokenSecret, auth.value.role)) return socket.close(4003, "Audience authentication failed")
            if (socket.readyState !== WebSocket.OPEN) return
            state.role = auth.value.role
            audiences.add(socket)
            metrics.audiences = audiences.size
          }
          state.authenticated = true
          clearTimeout(authTimeout)
          send(socket, { type: "ready", role: state.role, connectionId: randomUUID(), heartbeatMs: HEARTBEAT_MS, serverTime: new Date().toISOString() })
        } finally {
          state.processing = false
        }
        return
      }

      if (state.role !== "scanner") return send(socket, { type: "error", code: "read_only", retryable: false })
      const scan = validateScanMessage(message)
      if (!scan.ok) return send(socket, { type: "scan.result", scanId: message?.scanId ?? "", httpStatus: 400, retryable: false, result: { error: scan.error } })
      const now = Date.now()
      state.scanTimes = state.scanTimes.filter((value) => now - value < RATE_WINDOW_MS)
      if (state.scanTimes.length >= MAX_SCANS_PER_WINDOW) return send(socket, { type: "scan.result", scanId: scan.value.scanId, httpStatus: 429, retryable: true, result: { error: "Rate limit exceeded" } })
      state.scanTimes.push(now)
      state.processing = true
      try {
        const upstream = await upstreamPost(baseUrl, state.apiKey, {
          deviceId: state.deviceId,
          macAddress: state.macAddress,
          scanId: scan.value.scanId,
          decodedData: scan.value.decodedData,
        }, upstreamTimeoutMs)
        if (durableAcknowledgement(upstream.status, upstream.body, scan.value.scanId)) {
          metrics.durableAcks++
          send(socket, { type: "scan.ack", scanId: scan.value.scanId, httpStatus: upstream.status, result: upstream.body })
          const changed = { type: "attendance.changed", scanId: scan.value.scanId, deviceId: state.deviceId, entryState: upstream.body.entryState ?? null, changedAt: new Date().toISOString() }
          for (const audience of audiences) send(audience, changed)
        } else {
          metrics.upstreamFailures++
          const retryable = upstream.status === 0 || upstream.status === 408 || upstream.status === 425 || upstream.status === 429 || upstream.status >= 500
            || (upstream.status >= 200 && upstream.status < 300)
          send(socket, { type: "scan.result", scanId: scan.value.scanId, httpStatus: upstream.status || 503, retryable, result: upstream.body })
        }
      } finally {
        state.processing = false
      }
    })
  })

  const heartbeat = setInterval(() => {
    for (const socket of webSockets.clients) {
      const state = states.get(socket)
      if (!state?.alive) socket.terminate()
      else {
        state.alive = false
        socket.ping()
      }
    }
  }, HEARTBEAT_MS)
  heartbeat.unref()

  return {
    start: () => new Promise((resolve, reject) => {
      httpServer.once("error", reject)
      httpServer.listen(port, host, () => {
        httpServer.off("error", reject)
        resolve()
      })
    }),
    stop: () => new Promise((resolve) => {
      clearInterval(heartbeat)
      for (const socket of webSockets.clients) socket.terminate()
      webSockets.close(() => httpServer.close(() => resolve()))
    }),
    address: () => httpServer.address(),
  }
}
