export type RealtimeRelayClientMessage =
  | { v: 1; type: "ready"; role: "dashboard" | "display" }
  | { v: 1; type: "attendance.changed"; scanId?: string }

export function parseRealtimeRelayMessage(raw: string): RealtimeRelayClientMessage | null {
  try {
    const value = JSON.parse(raw) as Partial<RealtimeRelayClientMessage>
    if (value?.v !== 1) return null
    if (value.type === "ready" && (value.role === "dashboard" || value.role === "display")) {
      return value as RealtimeRelayClientMessage
    }
    if (value.type === "attendance.changed") return value as RealtimeRelayClientMessage
    return null
  } catch {
    return null
  }
}

export function realtimeReconnectDelay(attempt: number, random = Math.random) {
  const base = Math.min(30_000, 1_000 * 2 ** Math.max(0, Math.min(attempt, 10)))
  return Math.min(30_000, Math.round(base + base * 0.25 * random()))
}

export function createRealtimeRefreshQueue(refresh: () => void | Promise<void>) {
  let active: Promise<void> | null = null
  let pending = false

  const run = () => {
    if (active) {
      pending = true
      return
    }
    active = (async () => {
      do {
        pending = false
        await refresh()
      } while (pending)
    })().finally(() => { active = null })
  }

  return {
    notify: run,
    whenIdle: async () => {
      while (active) await active
    },
  }
}
