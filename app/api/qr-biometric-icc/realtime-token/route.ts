import { NextRequest, NextResponse } from "next/server"

import { ACCESS_SESSION_COOKIE, verifyAccessSession } from "@/lib/access-auth"
import { ADMIN_SESSION_COOKIE, verifyAdminSession } from "@/lib/admin-auth"
import { createRealtimeRelayToken } from "@/lib/realtime-relay-token"

export const dynamic = "force-dynamic"
export const revalidate = 0

const RESPONSE_HEADERS = { "cache-control": "private, no-store" }

function relayUrl() {
  try {
    const url = new URL(process.env.QR_RELAY_URL ?? "")
    return url.protocol === "wss:" && !url.username && !url.password ? url.toString() : null
  } catch {
    return null
  }
}

export async function GET(request: NextRequest) {
  const authenticated = verifyAdminSession(request.cookies.get(ADMIN_SESSION_COOKIE)?.value)
    || await verifyAccessSession(request.cookies.get(ACCESS_SESSION_COOKIE)?.value)
  if (!authenticated) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401, headers: RESPONSE_HEADERS })

  const url = relayUrl()
  const secret = process.env.QR_RELAY_TOKEN_SECRET ?? ""
  if (!url || Buffer.byteLength(secret) < 32) {
    return NextResponse.json({ success: false, error: "Realtime relay unavailable" }, { status: 503, headers: RESPONSE_HEADERS })
  }

  const now = Date.now()
  return NextResponse.json({
    success: true,
    url,
    token: createRealtimeRelayToken(secret, "dashboard", now),
    expiresAt: new Date(now + 60_000).toISOString(),
  }, { headers: RESPONSE_HEADERS })
}
