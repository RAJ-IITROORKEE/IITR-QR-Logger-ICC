import { get } from "@vercel/blob"
import { NextRequest, NextResponse } from "next/server"

import { authenticateAttendanceDevice } from "@/lib/attendance-device-auth"
import { isStoredStudentPhotoUrl, normalizeStudentPhotoContentType } from "@/lib/qr-biometric-photo"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"
export const revalidate = 0

const MAX_DEVICE_PHOTO_BYTES = 5 * 1024 * 1024
const OBJECT_ID_PATTERN = /^[0-9a-f]{24}$/i

export async function GET(request: NextRequest, { params }: { params: Promise<{ identityId: string }> }) {
  const auth = await authenticateAttendanceDevice(request.headers).catch((error) => {
    console.error("[device-api] Photo authentication unavailable", error)
    return null
  })
  if (!auth) return NextResponse.json({ success: false, error: "Device authentication temporarily unavailable" }, { status: 503 })
  if (!auth.ok) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })

  const { identityId } = await params
  if (!OBJECT_ID_PATTERN.test(identityId)) return NextResponse.json({ success: false, error: "Student photo not found" }, { status: 404 })

  try {
    const identity = await prisma.studentIdentity.findUnique({
      where: { id: identityId },
      select: { studentPhotoUrl: true, photoVersion: true },
    })
    if (!identity || !isStoredStudentPhotoUrl(identity.studentPhotoUrl)) {
      return NextResponse.json({ success: false, error: "Student photo not found" }, { status: 404 })
    }

    const requestedVersion = new URL(request.url).searchParams.get("v")
    if (requestedVersion !== null && requestedVersion !== String(identity.photoVersion)) {
      return NextResponse.json({ success: false, error: "Student photo version is no longer available" }, { status: 404 })
    }

    const blob = await get(identity.studentPhotoUrl, {
      access: "private",
      ifNoneMatch: request.headers.get("if-none-match") ?? undefined,
    })
    if (!blob) return NextResponse.json({ success: false, error: "Student photo not found" }, { status: 404 })
    if (blob.statusCode === 304) return new Response(null, { status: 304, headers: { etag: blob.blob.etag, "cache-control": "private, no-cache" } })
    if (blob.blob.size > MAX_DEVICE_PHOTO_BYTES) return NextResponse.json({ success: false, error: "Student photo is too large" }, { status: 413 })
    const contentType = normalizeStudentPhotoContentType(blob.blob.contentType)
    if (!contentType) return NextResponse.json({ success: false, error: "Student photo type is not allowed" }, { status: 415 })

    return new Response(blob.stream, {
      headers: {
        "cache-control": "private, no-cache",
        "content-length": String(blob.blob.size),
        "content-type": contentType,
        etag: blob.blob.etag,
        "x-content-type-options": "nosniff",
      },
    })
  } catch (error) {
    console.error("[device-api] Student photo unavailable", error)
    return NextResponse.json({ success: false, error: "Student photo temporarily unavailable" }, { status: 502 })
  }
}
