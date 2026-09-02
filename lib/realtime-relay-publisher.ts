const MAX_PUBLISH_TIMEOUT_MS = 2_000

function publishUrl() {
  try {
    const base = new URL(process.env.QR_RELAY_PUBLISH_URL ?? "")
    if (base.protocol !== "https:" || base.username || base.password) return null
    return new URL("/v1/publish", base).toString()
  } catch {
    return null
  }
}

export async function publishRealtimeAttendanceHint(sequence: bigint, changedAt: Date) {
  const url = publishUrl()
  const secret = process.env.QR_RELAY_PUBLISH_SECRET ?? ""
  if (!url || Buffer.byteLength(secret) < 32 || sequence < BigInt(1) || Number.isNaN(changedAt.getTime())) return

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), MAX_PUBLISH_TIMEOUT_MS)
  try {
    await fetch(url, {
      method: "POST",
      headers: {
        authorization: `Bearer ${secret}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ sequence: sequence.toString(), changedAt: changedAt.toISOString() }),
      cache: "no-store",
      signal: controller.signal,
    })
  } catch {
    // Realtime is an accelerator. HTTPS feed polling reconciles any missed hint.
  } finally {
    clearTimeout(timeout)
  }
}
