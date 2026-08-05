import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"

import { authenticateAttendanceDevice } from "@/lib/attendance-device-auth"
import { normalizeEnrollmentKey } from "@/lib/attendance-device-contract"
import { isStoredStudentPhotoUrl } from "@/lib/qr-biometric-photo"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"
export const revalidate = 0

const RESPONSE_HEADERS = {
  "cache-control": "private, no-store",
  vary: "Authorization, X-Device-Id",
}

function json(body: object, status: number) {
  return NextResponse.json(body, { status, headers: RESPONSE_HEADERS })
}

export async function GET(request: NextRequest) {
  const auth = await authenticateAttendanceDevice(request.headers).catch((error) => {
    console.error("[device-api] Student lookup authentication unavailable", error)
    return null
  })
  if (!auth) return json({ success: false, error: "Device authentication temporarily unavailable" }, 503)
  if (!auth.ok) return json({ success: false, error: auth.error }, auth.status)

  const enrollmentKey = normalizeEnrollmentKey(new URL(request.url).searchParams.get("enrollment"))
  if (!enrollmentKey) return json({ success: false, error: "Invalid enrollment" }, 400)

  try {
    const identity = await prisma.studentIdentity.findUnique({
      where: { enrollmentKey },
      select: {
        id: true,
        enrollmentNo: true,
        fullName: true,
        photoVersion: true,
        studentPhotoUrl: true,
      },
    })
    if (!identity) return json({ success: false, error: "Student not found" }, 404)

    const projection = await prisma.attendanceProjection.findUnique({
      where: { enrollmentKey },
      select: { currentState: true, latestOccurredAt: true },
    })
    const photoPath = isStoredStudentPhotoUrl(identity.studentPhotoUrl)
      ? `/api/device/v1/photos/${identity.id}?v=${identity.photoVersion}`
      : null

    return json({
      success: true,
      schemaVersion: 1,
      student: {
        identityId: identity.id,
        name: identity.fullName,
        enrollment: identity.enrollmentNo,
        photoVersion: identity.photoVersion,
        photoPath,
      },
      attendance: {
        currentState: projection?.currentState ?? "OUT",
        latestOccurredAt: projection?.latestOccurredAt?.toISOString() ?? null,
      },
      serverTime: new Date().toISOString(),
    }, 200)
  } catch (error) {
    console.error("[device-api] Student lookup unavailable", error)
    return json({ success: false, error: "Student lookup temporarily unavailable" }, 503)
  }
}
