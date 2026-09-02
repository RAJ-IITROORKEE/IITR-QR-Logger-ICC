import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"

import { authenticateAttendanceDevice } from "@/lib/attendance-device-auth"
import { normalizeEnrollmentKey } from "@/lib/attendance-device-contract"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"
export const revalidate = 0

const DEFAULT_LIMIT = 20
const MAX_LIMIT = 50
const RESPONSE_HEADERS = { "cache-control": "private, no-store", vary: "Authorization, X-Device-Id" }

function json(body: object, status: number) {
  return NextResponse.json(body, { status, headers: RESPONSE_HEADERS })
}

function readLimit(value: string | null) {
  if (value === null || value === "") return DEFAULT_LIMIT
  if (!/^[0-9]{1,4}$/.test(value)) return null
  const parsed = Number(value)
  return parsed > 0 ? Math.min(parsed, MAX_LIMIT) : null
}

export async function GET(request: NextRequest) {
  const auth = await authenticateAttendanceDevice(request.headers, ["TAB5_DISPLAY"]).catch((error) => {
    console.error("[device-api] Student history authentication unavailable", error)
    return null
  })
  if (!auth) return json({ success: false, error: "Device authentication temporarily unavailable" }, 503)
  if (!auth.ok) return json({ success: false, error: auth.error }, auth.status)

  const url = new URL(request.url)
  const enrollmentKey = normalizeEnrollmentKey(url.searchParams.get("enrollment"))
  const limit = readLimit(url.searchParams.get("limit"))
  if (!enrollmentKey) return json({ success: false, error: "Invalid enrollment" }, 400)
  if (limit === null) return json({ success: false, error: "Invalid limit" }, 400)

  try {
    const events = await prisma.attendanceEvent.findMany({
      where: { enrollmentKey, status: "APPLIED" },
      orderBy: { occurredAt: "desc" },
      take: limit + 1,
      select: { occurredAt: true, effectiveState: true, sourceType: true },
    })
    const history = events.slice(0, limit).flatMap((event) => {
      if ((event.effectiveState !== "IN" && event.effectiveState !== "OUT") || !event.occurredAt) return []
      return [{ occurredAt: event.occurredAt.toISOString(), entryState: event.effectiveState, source: event.sourceType }]
    })
    return json({
      success: true,
      schemaVersion: 1,
      enrollment: enrollmentKey,
      hasMore: events.length > limit,
      history,
      serverTime: new Date().toISOString(),
    }, 200)
  } catch (error) {
    console.error("[device-api] Student history unavailable", error)
    return json({ success: false, error: "Student history temporarily unavailable" }, 503)
  }
}
