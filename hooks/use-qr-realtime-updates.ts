"use client"

import { useEffect, useEffectEvent } from "react"

import { createRealtimeRefreshQueue, parseRealtimeRelayMessage, realtimeReconnectDelay } from "@/lib/realtime-relay-client"

type TokenResponse = {
  success?: boolean
  url?: string
  token?: string
}

export function useQrRealtimeUpdates(onAttendanceChanged: () => void | Promise<void>) {
  const notifyAttendanceChanged = useEffectEvent(onAttendanceChanged)

  useEffect(() => {
    let stopped = false
    let connecting = false
    let reconnectAttempt = 0
    let reconnectTimer = 0
    let socket: WebSocket | null = null
    const refreshQueue = createRealtimeRefreshQueue(() => notifyAttendanceChanged())

    const scheduleReconnect = (delay?: number) => {
      if (stopped || reconnectTimer) return
      const wait = delay ?? realtimeReconnectDelay(reconnectAttempt++)
      reconnectTimer = window.setTimeout(() => {
        reconnectTimer = 0
        void connect()
      }, wait)
    }

    const connect = async () => {
      if (stopped || connecting || socket || document.visibilityState !== "visible") {
        if (!stopped && document.visibilityState !== "visible") scheduleReconnect(5_000)
        return
      }
      connecting = true
      try {
        const response = await fetch("/api/qr-biometric-icc/realtime-token", { cache: "no-store" })
        const credentials = (await response.json().catch(() => null)) as TokenResponse | null
        if (!response.ok || !credentials?.success || !credentials.url || !credentials.token || stopped) {
          scheduleReconnect()
          return
        }

        const candidate = new WebSocket(credentials.url)
        socket = candidate
        candidate.addEventListener("open", () => {
          candidate.send(JSON.stringify({ v: 1, type: "auth", role: "dashboard", token: credentials.token }))
        })
        candidate.addEventListener("message", (event) => {
          if (typeof event.data !== "string") return
          const message = parseRealtimeRelayMessage(event.data)
          if (message?.type === "ready") {
            reconnectAttempt = 0
            return
          }
          if (message?.type !== "attendance.changed" || document.visibilityState !== "visible") return
          refreshQueue.notify()
        })
        candidate.addEventListener("close", () => {
          if (socket === candidate) socket = null
          scheduleReconnect()
        })
        candidate.addEventListener("error", () => candidate.close())
      } catch {
        scheduleReconnect()
      } finally {
        connecting = false
      }
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible") {
        socket?.close(1000, "Page hidden")
        return
      }
      if (reconnectTimer) window.clearTimeout(reconnectTimer)
      reconnectTimer = 0
      reconnectAttempt = 0
      void connect()
    }

    document.addEventListener("visibilitychange", handleVisibilityChange)
    void connect()
    return () => {
      stopped = true
      document.removeEventListener("visibilitychange", handleVisibilityChange)
      if (reconnectTimer) window.clearTimeout(reconnectTimer)
      socket?.close(1000, "Page closed")
    }
  }, [])
}
