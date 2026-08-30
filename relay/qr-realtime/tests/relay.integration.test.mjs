import assert from "node:assert/strict"
import { createServer } from "node:http"
import test from "node:test"
import { WebSocket } from "ws"

import { createRelayServer } from "../src/server.mjs"

const scannerKey = `qlicc_${"a".repeat(43)}`
const scannerId = "QRB-201"
const scannerMac = "98:88:E0:0E:DD:50"
const tokenSecret = "s".repeat(64)

function waitForMessage(socket, type) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Timed out waiting for ${type}`)), 2_000)
    const listener = (data) => {
      const message = JSON.parse(data.toString())
      if (message.type !== type) return
      clearTimeout(timeout)
      socket.off("message", listener)
      resolve(message)
    }
    socket.on("message", listener)
  })
}

async function openClient(url, auth) {
  const socket = new WebSocket(url)
  await new Promise((resolve, reject) => { socket.once("open", resolve); socket.once("error", reject) })
  const ready = waitForMessage(socket, "ready")
  socket.send(JSON.stringify(auth))
  await ready
  return socket
}

function audienceToken(role = "dashboard") {
  const { createHmac } = requireCrypto
  const now = Math.floor(Date.now() / 1000)
  const encoded = Buffer.from(JSON.stringify({ v: 1, aud: "qr-realtime-relay", role, iat: now, exp: now + 60, nonce: "test" })).toString("base64url")
  return `${encoded}.${createHmac("sha256", tokenSecret).update(encoded).digest("base64url")}`
}

const requireCrypto = await import("node:crypto")

test("ACKs and broadcasts only after the upstream API durably saves the same scanId", async (t) => {
  const upstreamRequests = []
  const upstream = createServer(async (request, response) => {
    const chunks = []
    for await (const chunk of request) chunks.push(chunk)
    const body = JSON.parse(Buffer.concat(chunks).toString())
    upstreamRequests.push({ path: request.url, apiKey: request.headers["x-api-key"], body })
    response.setHeader("content-type", "application/json")
    if (body.event === "device-online") return response.end(JSON.stringify({ success: true, deviceId: scannerId }))
    response.end(JSON.stringify({ success: true, scanId: body.scanId, fullName: "Student", enrollmentNo: "23100001", entryState: "IN", persistence: { status: "saved" } }))
  })
  await new Promise((resolve) => upstream.listen(0, "127.0.0.1", resolve))
  t.after(() => upstream.close())
  const upstreamUrl = `http://127.0.0.1:${upstream.address().port}`

  const relay = createRelayServer({ upstreamBaseUrl: upstreamUrl, tokenSecret, port: 0, host: "127.0.0.1", allowInsecureUpstream: true })
  await relay.start()
  t.after(() => relay.stop())
  const relayUrl = `ws://127.0.0.1:${relay.address().port}/v1/realtime`

  const dashboard = await openClient(relayUrl, { v: 1, type: "auth", role: "dashboard", token: audienceToken() })
  const scanner = await openClient(relayUrl, { v: 1, type: "auth", role: "scanner", deviceId: scannerId, apiKey: scannerKey, macAddress: scannerMac })
  t.after(() => { dashboard.close(); scanner.close() })

  const scanId = "a".repeat(24)
  const ack = waitForMessage(scanner, "scan.ack")
  const changed = waitForMessage(dashboard, "attendance.changed")
  scanner.send(JSON.stringify({ v: 1, type: "scan.submit", scanId, decodedData: "https://dosw.iitr.ac.in/StudentProxy.aspx?id=1" }))

  assert.equal((await ack).scanId, scanId)
  assert.equal((await changed).scanId, scanId)
  assert.equal(upstreamRequests.at(-1).apiKey, scannerKey)
  assert.equal(upstreamRequests.at(-1).body.scanId, scanId)
})

test("does not broadcast or manufacture an ACK for an incomplete upstream response", async (t) => {
  const upstream = createServer(async (request, response) => {
    for await (const _ of request) { /* drain */ }
    response.setHeader("content-type", "application/json")
    response.end(JSON.stringify({ success: true, persistence: { status: "saved" } }))
  })
  await new Promise((resolve) => upstream.listen(0, "127.0.0.1", resolve))
  t.after(() => upstream.close())
  const relay = createRelayServer({ upstreamBaseUrl: `http://127.0.0.1:${upstream.address().port}`, tokenSecret, port: 0, host: "127.0.0.1", skipScannerOnlineCheck: true, allowInsecureUpstream: true })
  await relay.start()
  t.after(() => relay.stop())
  const relayUrl = `ws://127.0.0.1:${relay.address().port}/v1/realtime`
  const dashboard = await openClient(relayUrl, { v: 1, type: "auth", role: "dashboard", token: audienceToken() })
  const scanner = await openClient(relayUrl, { v: 1, type: "auth", role: "scanner", deviceId: scannerId, apiKey: scannerKey, macAddress: scannerMac })
  t.after(() => { dashboard.close(); scanner.close() })
  let broadcast = false
  dashboard.on("message", (data) => { if (JSON.parse(data.toString()).type === "attendance.changed") broadcast = true })
  const result = waitForMessage(scanner, "scan.result")
  scanner.send(JSON.stringify({ v: 1, type: "scan.submit", scanId: "b".repeat(24), decodedData: "https://dosw.iitr.ac.in/StudentProxy.aspx?id=2" }))
  assert.equal((await result).retryable, true)
  await new Promise((resolve) => setTimeout(resolve, 50))
  assert.equal(broadcast, false)
})

test("handles 20 authenticated scanners concurrently without losing durable ACKs", async (t) => {
  const upstream = createServer(async (request, response) => {
    const chunks = []
    for await (const chunk of request) chunks.push(chunk)
    const body = JSON.parse(Buffer.concat(chunks).toString())
    response.setHeader("content-type", "application/json")
    if (body.event === "device-online") return response.end(JSON.stringify({ success: true, deviceId: body.deviceId }))
    response.end(JSON.stringify({ success: true, scanId: body.scanId, entryState: "IN", persistence: { status: "saved" } }))
  })
  await new Promise((resolve) => upstream.listen(0, "127.0.0.1", resolve))
  t.after(() => upstream.close())
  const relay = createRelayServer({ upstreamBaseUrl: `http://127.0.0.1:${upstream.address().port}`, tokenSecret, port: 0, host: "127.0.0.1", allowInsecureUpstream: true })
  await relay.start()
  t.after(() => relay.stop())
  const relayUrl = `ws://127.0.0.1:${relay.address().port}/v1/realtime`
  const dashboard = await openClient(relayUrl, { v: 1, type: "auth", role: "dashboard", token: audienceToken() })
  const scanners = await Promise.all(Array.from({ length: 20 }, (_, index) => openClient(relayUrl, {
    v: 1,
    type: "auth",
    role: "scanner",
    deviceId: `QRB-${String(index + 1).padStart(3, "0")}`,
    apiKey: scannerKey,
    macAddress: `02:00:00:00:00:${index.toString(16).padStart(2, "0").toUpperCase()}`,
  })))
  t.after(() => { dashboard.close(); for (const scanner of scanners) scanner.close() })

  let notifications = 0
  dashboard.on("message", (data) => { if (JSON.parse(data.toString()).type === "attendance.changed") notifications++ })
  const acknowledgements = scanners.map((scanner, index) => {
    const scanId = index.toString(16).padStart(24, "0")
    const acknowledgement = waitForMessage(scanner, "scan.ack")
    scanner.send(JSON.stringify({ v: 1, type: "scan.submit", scanId, decodedData: `https://dosw.iitr.ac.in/StudentProxy.aspx?id=${index}` }))
    return acknowledgement
  })
  await Promise.all(acknowledgements)
  const deadline = Date.now() + 2_000
  while (notifications < 20 && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 10))
  assert.equal(notifications, 20)
})

test("rejects plaintext upstream URLs unless a test explicitly opts in", () => {
  assert.throws(() => createRelayServer({ upstreamBaseUrl: "http://example.com", tokenSecret }), /HTTPS/)
})

test("does not time out a structurally valid scanner while upstream auth is running", async (t) => {
  const upstream = createServer(async (request, response) => {
    for await (const _ of request) { /* drain */ }
    await new Promise((resolve) => setTimeout(resolve, 80))
    response.setHeader("content-type", "application/json")
    response.end(JSON.stringify({ success: true, deviceId: scannerId }))
  })
  await new Promise((resolve) => upstream.listen(0, "127.0.0.1", resolve))
  t.after(() => upstream.close())
  const relay = createRelayServer({
    upstreamBaseUrl: `http://127.0.0.1:${upstream.address().port}`,
    tokenSecret,
    port: 0,
    host: "127.0.0.1",
    authTimeoutMs: 30,
    upstreamTimeoutMs: 500,
    allowInsecureUpstream: true,
  })
  await relay.start()
  t.after(() => relay.stop())
  const relayUrl = `ws://127.0.0.1:${relay.address().port}/v1/realtime`
  const scanner = await openClient(relayUrl, { v: 1, type: "auth", role: "scanner", deviceId: scannerId, apiKey: scannerKey, macAddress: scannerMac })
  t.after(() => scanner.close())
  assert.equal(scanner.readyState, WebSocket.OPEN)
})

test("reports the measured upstream scan latency", async (t) => {
  const upstream = createServer(async (request, response) => {
    const chunks = []
    for await (const chunk of request) chunks.push(chunk)
    const body = JSON.parse(Buffer.concat(chunks).toString())
    await new Promise((resolve) => setTimeout(resolve, 40))
    response.setHeader("content-type", "application/json")
    response.end(JSON.stringify({ success: true, scanId: body.scanId, entryState: "IN", persistence: { status: "saved" } }))
  })
  await new Promise((resolve) => upstream.listen(0, "127.0.0.1", resolve))
  t.after(() => upstream.close())
  const relay = createRelayServer({
    upstreamBaseUrl: `http://127.0.0.1:${upstream.address().port}`,
    tokenSecret,
    port: 0,
    host: "127.0.0.1",
    skipScannerOnlineCheck: true,
    allowInsecureUpstream: true,
  })
  await relay.start()
  t.after(() => relay.stop())
  const baseUrl = `http://127.0.0.1:${relay.address().port}`
  const scanner = await openClient(baseUrl.replace("http:", "ws:") + "/v1/realtime", { v: 1, type: "auth", role: "scanner", deviceId: scannerId, apiKey: scannerKey, macAddress: scannerMac })
  t.after(() => scanner.close())

  const acknowledgement = waitForMessage(scanner, "scan.ack")
  scanner.send(JSON.stringify({ v: 1, type: "scan.submit", scanId: "c".repeat(24), decodedData: "https://dosw.iitr.ac.in/StudentProxy.aspx?id=3" }))
  await acknowledgement

  const metrics = await (await fetch(`${baseUrl}/metrics`)).json()
  assert.equal(metrics.upstreamRequests, 1)
  assert.ok(metrics.lastUpstreamMs >= 35)
  assert.ok(metrics.maxUpstreamMs >= metrics.lastUpstreamMs)
})

test("reuses one in-flight upstream request when the scanner retries after a relay timeout", async (t) => {
  let requests = 0
  let concurrent = 0
  let maxConcurrent = 0
  const upstream = createServer(async (request, response) => {
    const chunks = []
    for await (const chunk of request) chunks.push(chunk)
    const body = JSON.parse(Buffer.concat(chunks).toString())
    requests++
    concurrent++
    maxConcurrent = Math.max(maxConcurrent, concurrent)
    await new Promise((resolve) => setTimeout(resolve, 100))
    concurrent--
    response.setHeader("content-type", "application/json")
    response.end(JSON.stringify({ success: true, scanId: body.scanId, entryState: "IN", persistence: { status: "saved" } }))
  })
  await new Promise((resolve) => upstream.listen(0, "127.0.0.1", resolve))
  t.after(() => upstream.close())
  const relay = createRelayServer({
    upstreamBaseUrl: `http://127.0.0.1:${upstream.address().port}`,
    tokenSecret,
    port: 0,
    host: "127.0.0.1",
    skipScannerOnlineCheck: true,
    allowInsecureUpstream: true,
    upstreamTimeoutMs: 30,
    upstreamOperationTimeoutMs: 500,
  })
  await relay.start()
  t.after(() => relay.stop())
  const relayUrl = `ws://127.0.0.1:${relay.address().port}/v1/realtime`
  const scanner = await openClient(relayUrl, { v: 1, type: "auth", role: "scanner", deviceId: scannerId, apiKey: scannerKey, macAddress: scannerMac })
  t.after(() => scanner.close())
  const payload = { v: 1, type: "scan.submit", scanId: "d".repeat(24), decodedData: "https://dosw.iitr.ac.in/StudentProxy.aspx?id=4" }

  const firstResult = waitForMessage(scanner, "scan.result")
  scanner.send(JSON.stringify(payload))
  await firstResult
  await new Promise((resolve) => setTimeout(resolve, 50))
  const acknowledgement = waitForMessage(scanner, "scan.ack")
  scanner.send(JSON.stringify(payload))

  assert.equal((await acknowledgement).scanId, payload.scanId)
  assert.equal(requests, 1)
  assert.equal(maxConcurrent, 1)
})

test("starts a fresh upstream request after a completed transient failure", async (t) => {
  let requests = 0
  const upstream = createServer(async (request, response) => {
    const chunks = []
    for await (const chunk of request) chunks.push(chunk)
    const body = JSON.parse(Buffer.concat(chunks).toString())
    requests++
    response.setHeader("content-type", "application/json")
    if (requests === 1) {
      response.writeHead(503).end(JSON.stringify({ success: false, error: "Temporary failure" }))
      return
    }
    response.end(JSON.stringify({ success: true, scanId: body.scanId, entryState: "OUT", persistence: { status: "saved" } }))
  })
  await new Promise((resolve) => upstream.listen(0, "127.0.0.1", resolve))
  t.after(() => upstream.close())
  const relay = createRelayServer({ upstreamBaseUrl: `http://127.0.0.1:${upstream.address().port}`, tokenSecret, port: 0, host: "127.0.0.1", skipScannerOnlineCheck: true, allowInsecureUpstream: true })
  await relay.start()
  t.after(() => relay.stop())
  const scanner = await openClient(`ws://127.0.0.1:${relay.address().port}/v1/realtime`, { v: 1, type: "auth", role: "scanner", deviceId: scannerId, apiKey: scannerKey, macAddress: scannerMac })
  t.after(() => scanner.close())
  const payload = { v: 1, type: "scan.submit", scanId: "e".repeat(24), decodedData: "https://dosw.iitr.ac.in/StudentProxy.aspx?id=5" }

  const failed = waitForMessage(scanner, "scan.result")
  scanner.send(JSON.stringify(payload))
  assert.equal((await failed).httpStatus, 503)
  const acknowledgement = waitForMessage(scanner, "scan.ack")
  scanner.send(JSON.stringify(payload))

  assert.equal((await acknowledgement).scanId, payload.scanId)
  assert.equal(requests, 2)
})
