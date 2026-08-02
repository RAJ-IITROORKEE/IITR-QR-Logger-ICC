import { get } from "@vercel/blob"
import { NextRequest, NextResponse } from "next/server"

import { ACCESS_SESSION_COOKIE, verifyAccessSession } from "@/lib/access-auth"
import { ADMIN_SESSION_COOKIE, verifyAdminSession } from "@/lib/admin-auth"
import { isStoredStudentPhotoUrl, normalizeStudentPhotoContentType } from "@/lib/qr-biometric-photo"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"
export const revalidate = 0

async function hasDashboardAccess(request: NextRequest) {
  if (verifyAdminSession(request.cookies.get(ADMIN_SESSION_COOKIE)?.value)) return true
  return verifyAccessSession(request.cookies.get(ACCESS_SESSION_COOKIE)?.value)
}

export async function GET(request: NextRequest) {
  if (!(await hasDashboardAccess(request))) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })

  const source = new URL(request.url).searchParams.get("src")
  if (!isStoredStudentPhotoUrl(source)) return NextResponse.json({ success: false, error: "Invalid stored student photo URL" }, { status: 400 })

  try {
    const storedPhoto = await prisma.qrBiometricReading.findFirst({ where: { studentPhotoUrl: source }, select: { id: true } })
    if (!storedPhoto) return NextResponse.json({ success: false, error: "Student photo not found" }, { status: 404 })

    const blob = await get(source, { access: "private" })
    if (!blob) return NextResponse.json({ success: false, error: "Student photo not found" }, { status: 404 })
    const contentType = normalizeStudentPhotoContentType(blob.blob.contentType)
    if (!contentType) return NextResponse.json({ success: false, error: "Stored student photo type is not allowed" }, { status: 415 })
    return new Response(blob.stream, {
      headers: {
        "cache-control": "private, no-store",
        "content-type": contentType,
        "x-content-type-options": "nosniff",
      },
    })
  } catch (error) {
    console.error("[qr-biometric] Stored student photo unavailable", error)
    return NextResponse.json({ success: false, error: "Student photo unavailable" }, { status: 502 })
  }
}
