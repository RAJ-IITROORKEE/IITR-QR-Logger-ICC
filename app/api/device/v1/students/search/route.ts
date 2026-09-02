import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"

import { authenticateAttendanceDevice } from "@/lib/attendance-device-auth"
import { normalizeEnrollmentKey } from "@/lib/attendance-device-contract"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"
export const revalidate = 0

const RESPONSE_HEADERS = { "cache-control": "private, no-store", vary: "Authorization, X-Device-Id" }

function json(body: object, status: number) {
  return NextResponse.json(body, { status, headers: RESPONSE_HEADERS })
}

export async function GET(request: NextRequest) {
  const auth = await authenticateAttendanceDevice(request.headers, ["TAB5_DISPLAY"]).catch((error) => {
    console.error("[device-api] Student search authentication unavailable", error)
    return null
  })
  if (!auth) return json({ success: false, error: "Device authentication temporarily unavailable" }, 503)
  if (!auth.ok) return json({ success: false, error: auth.error }, auth.status)

  const prefix = normalizeEnrollmentKey(new URL(request.url).searchParams.get("q"))
  if (!prefix) return json({ success: false, error: "Invalid enrollment prefix" }, 400)

  try {
    const students = await prisma.studentIdentity.findMany({
      where: { enrollmentKey: { startsWith: prefix } },
      orderBy: { enrollmentKey: "asc" },
      take: 10,
      select: { enrollmentNo: true, fullName: true },
    })
    return json({
      success: true,
      schemaVersion: 1,
      students: students.map((student) => ({ enrollment: student.enrollmentNo, name: student.fullName })),
      serverTime: new Date().toISOString(),
    }, 200)
  } catch (error) {
    console.error("[device-api] Student search unavailable", error)
    return json({ success: false, error: "Student search temporarily unavailable" }, 503)
  }
}
