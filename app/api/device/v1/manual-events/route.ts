import { after, NextRequest, NextResponse } from "next/server"

import { ATTENDANCE_BATCH_MAX_BYTES, parseManualAttendanceBatch } from "@/lib/attendance-device-contract"
import { authenticateAttendanceDevice } from "@/lib/attendance-device-auth"
import { AttendanceEventConflictError, recordManualAttendanceBatch } from "@/lib/attendance-ledger"
import { prisma } from "@/lib/prisma"
import { publishRealtimeAttendanceHint } from "@/lib/realtime-relay-publisher"

export const dynamic = "force-dynamic"
export const revalidate = 0
export const maxDuration = 30

export async function POST(request: NextRequest) {
  const auth = await authenticateAttendanceDevice(request.headers).catch((error) => {
    console.error("[device-api] Manual attendance authentication unavailable", error)
    return null
  })
  if (!auth) return NextResponse.json({ success: false, error: "Device authentication temporarily unavailable" }, { status: 503 })
  if (!auth.ok) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })

  const declaredLength = Number.parseInt(request.headers.get("content-length") ?? "0", 10)
  if (Number.isFinite(declaredLength) && declaredLength > ATTENDANCE_BATCH_MAX_BYTES) {
    return NextResponse.json({ success: false, error: "Request body exceeds 32 KiB" }, { status: 413 })
  }

  const text = await request.text().catch(() => null)
  if (text === null) return NextResponse.json({ success: false, error: "Unable to read request body" }, { status: 400 })
  if (Buffer.byteLength(text, "utf8") > ATTENDANCE_BATCH_MAX_BYTES) {
    return NextResponse.json({ success: false, error: "Request body exceeds 32 KiB" }, { status: 413 })
  }
  const body = (() => {
    try {
      return JSON.parse(text) as unknown
    } catch {
      return null
    }
  })()
  const parsed = parseManualAttendanceBatch(body)
  if (!parsed.ok) return NextResponse.json({ success: false, error: parsed.error }, { status: 400 })

  try {
    const results = await recordManualAttendanceBatch(auth.device, parsed.value)
    after(async () => {
      try {
        const counter = await prisma.attendanceFeedCounter.findUnique({ where: { id: "attendance" } })
        if (counter) await publishRealtimeAttendanceHint(counter.value, new Date())
      } catch (error) {
        console.error("[device-api] Realtime attendance hint failed", error)
      }
    })
    return NextResponse.json({
      success: true,
      schemaVersion: 1,
      serverTime: new Date().toISOString(),
      results,
    })
  } catch (error) {
    if (error instanceof AttendanceEventConflictError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 409 })
    }
    console.error("[device-api] Manual attendance storage unavailable", error)
    return NextResponse.json({ success: false, error: "Attendance storage temporarily unavailable; retry the same event IDs" }, { status: 503 })
  }
}
