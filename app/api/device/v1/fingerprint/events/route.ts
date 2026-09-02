import { after, NextRequest, NextResponse } from "next/server"

import { authenticateAttendanceDevice } from "@/lib/attendance-device-auth"
import { AttendanceEventConflictError, recordFingerprintAttendanceBatch } from "@/lib/attendance-ledger"
import { FINGERPRINT_BATCH_MAX_BYTES, parseFingerprintEventBatch } from "@/lib/fingerprint-device-contract"
import { prisma } from "@/lib/prisma"
import { publishRealtimeAttendanceHint } from "@/lib/realtime-relay-publisher"

export const dynamic = "force-dynamic"
export const revalidate = 0
export const maxDuration = 30

const RESPONSE_HEADERS = {
  "cache-control": "private, no-store",
  vary: "Authorization, X-Device-Id",
}

function json(body: object, status = 200) {
  return NextResponse.json(body, { status, headers: RESPONSE_HEADERS })
}

export async function POST(request: NextRequest) {
  const auth = await authenticateAttendanceDevice(request.headers, ["TAB5_DISPLAY", "FINGERPRINT_READER"]).catch((error) => {
    console.error("[device-api] Fingerprint event authentication unavailable", error)
    return null
  })
  if (!auth) return json({ success: false, error: "Device authentication temporarily unavailable" }, 503)
  if (!auth.ok) return json({ success: false, error: auth.error }, auth.status)

  const declaredLength = Number.parseInt(request.headers.get("content-length") ?? "0", 10)
  if (Number.isFinite(declaredLength) && declaredLength > FINGERPRINT_BATCH_MAX_BYTES) {
    return json({ success: false, error: "Request body exceeds 32 KiB" }, 413)
  }

  const text = await request.text().catch(() => null)
  if (text === null) return json({ success: false, error: "Unable to read request body" }, 400)
  if (Buffer.byteLength(text, "utf8") > FINGERPRINT_BATCH_MAX_BYTES) {
    return json({ success: false, error: "Request body exceeds 32 KiB" }, 413)
  }

  const body = (() => {
    try {
      return JSON.parse(text) as unknown
    } catch {
      return null
    }
  })()
  const parsed = parseFingerprintEventBatch(body)
  if (!parsed.ok) return json({ success: false, error: parsed.error }, 400)

  try {
    const results = await recordFingerprintAttendanceBatch(auth.device, parsed.value)
    after(async () => {
      try {
        const counter = await prisma.attendanceFeedCounter.findUnique({ where: { id: "attendance" } })
        if (counter) await publishRealtimeAttendanceHint(counter.value, new Date())
      } catch (error) {
        console.error("[device-api] Realtime attendance hint failed", error)
      }
    })
    return json({
      success: true,
      schemaVersion: 1,
      serverTime: new Date().toISOString(),
      results,
    })
  } catch (error) {
    if (error instanceof AttendanceEventConflictError) return json({ success: false, error: error.message }, 409)
    console.error("[device-api] Fingerprint attendance storage unavailable", error)
    return json({ success: false, error: "Fingerprint attendance storage temporarily unavailable; retry the same event IDs" }, 503)
  }
}
