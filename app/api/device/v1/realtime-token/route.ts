import { NextRequest, NextResponse } from "next/server"

import { authenticateAttendanceDevice } from "@/lib/attendance-device-auth"
import { createRealtimeRelayToken } from "@/lib/realtime-relay-token"

export const dynamic = "force-dynamic"
export const revalidate = 0

const PROTOCOL_VERSION = 1
const RESPONSE_HEADERS = {
  "cache-control": "private, no-store",
  vary: "Authorization, X-Device-Id",
}

function json(body: object, status = 200) {
  return NextResponse.json(body, { status, headers: RESPONSE_HEADERS })
}

function relayUrl() {
  try {
    const url = new URL(process.env.QR_RELAY_URL ?? "")
    return url.protocol === "wss:" && !url.username && !url.password ? url.toString() : null
  } catch {
    return null
  }
}

export async function GET(request: NextRequest) {
  const auth = await authenticateAttendanceDevice(request.headers, ["TAB5_DISPLAY"]).catch((error) => {
    console.error("[device-api] Realtime token authentication unavailable", error)
    return null
  })
  if (!auth) return json({ success: false, error: "Device authentication temporarily unavailable" }, 503)
  if (!auth.ok) return json({ success: false, error: auth.error }, auth.status)

  const url = relayUrl()
  const secret = process.env.QR_RELAY_TOKEN_SECRET ?? ""
  if (!url || Buffer.byteLength(secret) < 32) {
    return json({ success: false, error: "Realtime relay unavailable" }, 503)
  }

  const now = Date.now()
  return json({
    success: true,
    url,
    token: createRealtimeRelayToken(secret, "display", now),
    expiresAt: new Date(now + 60_000).toISOString(),
    protocolVersion: PROTOCOL_VERSION,
  })
}
