import { NextRequest, NextResponse } from "next/server"

import { ACCESS_SESSION_COOKIE, verifyAccessSession } from "@/lib/access-auth"
import { ADMIN_SESSION_COOKIE, verifyAdminSession } from "@/lib/admin-auth"
import { ATTENDANCE_FEED_RETRY_MS } from "@/lib/attendance-device-contract"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"
export const revalidate = 0

const RESPONSE_HEADERS = { "cache-control": "private, no-store" }

export async function GET(request: NextRequest) {
  const authenticated = verifyAdminSession(request.cookies.get(ADMIN_SESSION_COOKIE)?.value)
    || await verifyAccessSession(request.cookies.get(ACCESS_SESSION_COOKIE)?.value)
  if (!authenticated) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401, headers: RESPONSE_HEADERS })

  try {
    const counter = await prisma.attendanceFeedCounter.findUnique({ where: { id: "attendance" }, select: { value: true } })
    return NextResponse.json({
      success: true,
      sequence: (counter?.value ?? BigInt(0)).toString(),
      retryAfterMs: ATTENDANCE_FEED_RETRY_MS,
    }, { headers: RESPONSE_HEADERS })
  } catch (error) {
    console.error("[qr-biometric] Dashboard change sequence unavailable", error)
    return NextResponse.json({ success: false, error: "Change feed temporarily unavailable" }, { status: 503, headers: RESPONSE_HEADERS })
  }
}
