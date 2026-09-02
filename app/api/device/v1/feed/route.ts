import { NextRequest, NextResponse } from "next/server"
import { after } from "next/server"

import { advanceAttendanceCursor, ATTENDANCE_FEED_RETRY_MS, decodeAttendanceCursor, encodeAttendanceCursor } from "@/lib/attendance-device-contract"
import { authenticateAttendanceDevice } from "@/lib/attendance-device-auth"
import { reconcilePendingCanonicalReadings } from "@/lib/attendance-ledger"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"
export const revalidate = 0

const DEFAULT_LIMIT = 20
const MAX_LIMIT = 50
const RESPONSE_HEADERS = {
  "cache-control": "private, no-store",
  vary: "Authorization, X-Device-Id",
}

function json(body: object, status = 200) {
  return NextResponse.json(body, { status, headers: RESPONSE_HEADERS })
}

function parseLimit(value: string | null) {
  if (!value) return DEFAULT_LIMIT
  const parsed = Number.parseInt(value, 10)
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, MAX_LIMIT) : DEFAULT_LIMIT
}

function toFeedChange(change: { sequence: bigint; kind: string; snapshot: unknown; createdAt: Date }) {
  return {
    sequence: change.sequence.toString(),
    kind: change.kind,
    snapshot: change.snapshot,
    createdAt: change.createdAt.toISOString(),
  }
}

export async function GET(request: NextRequest) {
  const auth = await authenticateAttendanceDevice(request.headers).catch((error) => {
    console.error("[device-api] Feed authentication unavailable", error)
    return null
  })
  if (!auth) return json({ success: false, error: "Device authentication temporarily unavailable" }, 503)
  if (!auth.ok) return json({ success: false, error: auth.error }, auth.status)
  after(async () => {
    await reconcilePendingCanonicalReadings().catch((error) => console.error("[device-api] Pending attendance reconciliation failed", error))
  })

  const url = new URL(request.url)
  const rawCursor = url.searchParams.get("cursor")
  const cursor = rawCursor === null ? null : decodeAttendanceCursor(rawCursor)
  if (rawCursor !== null && cursor === null) return json({ success: false, error: "Invalid attendance cursor" }, 400)
  const limit = parseLimit(url.searchParams.get("limit"))

  try {
    const counter = await prisma.attendanceFeedCounter.findUnique({ where: { id: "attendance" } })
    const currentSequence = counter?.value ?? BigInt(0)
    const audience = { OR: [{ audienceDeviceId: null }, { audienceDeviceId: auth.device.deviceId }] }
    const latestGlobalSnapshot = () => prisma.attendanceChange.findFirst({
      where: { audienceDeviceId: null, kind: "LATEST_SNAPSHOT" },
      orderBy: { sequence: "desc" },
    })

    if (cursor === null || cursor > currentSequence) {
      const snapshot = await latestGlobalSnapshot()
      const resetSequence = advanceAttendanceCursor(currentSequence, snapshot ? [snapshot.sequence] : [])
      return json({
        success: true,
        schemaVersion: 1,
        reset: true,
        cursor: encodeAttendanceCursor(resetSequence),
        hasMore: false,
        retryAfterMs: ATTENDANCE_FEED_RETRY_MS,
        serverTime: new Date().toISOString(),
        changes: snapshot ? [toFeedChange(snapshot)] : [],
      })
    }

    const oldestRelevant = await prisma.attendanceChange.findFirst({ where: audience, orderBy: { sequence: "asc" }, select: { sequence: true } })
    if (oldestRelevant && cursor + BigInt(1) < oldestRelevant.sequence) {
      const snapshot = await latestGlobalSnapshot()
      const resetSequence = advanceAttendanceCursor(currentSequence, snapshot ? [snapshot.sequence] : [])
      return json({
        success: true,
        schemaVersion: 1,
        reset: true,
        cursor: encodeAttendanceCursor(resetSequence),
        hasMore: false,
        retryAfterMs: ATTENDANCE_FEED_RETRY_MS,
        serverTime: new Date().toISOString(),
        changes: snapshot ? [toFeedChange(snapshot)] : [],
      })
    }

    const changes = await prisma.attendanceChange.findMany({
      where: { AND: [{ sequence: { gt: cursor } }, audience] },
      orderBy: { sequence: "asc" },
      take: limit + 1,
    })
    const hasMore = changes.length > limit
    const page = hasMore ? changes.slice(0, limit) : changes
    const nextSequence = hasMore
      ? page.at(-1)!.sequence
      : advanceAttendanceCursor(currentSequence, page.map((change) => change.sequence))
    const latestSnapshot = await latestGlobalSnapshot()
    const responsePage = latestSnapshot && !page.some((change) => change.sequence === latestSnapshot.sequence)
      ? [...page, latestSnapshot]
      : page

    return json({
      success: true,
      schemaVersion: 1,
      reset: false,
      cursor: encodeAttendanceCursor(nextSequence),
      hasMore,
      retryAfterMs: ATTENDANCE_FEED_RETRY_MS,
      serverTime: new Date().toISOString(),
      changes: responsePage.map(toFeedChange),
    })
  } catch (error) {
    console.error("[device-api] Attendance feed unavailable", error)
    return json({ success: false, error: "Attendance feed temporarily unavailable" }, 503)
  }
}
