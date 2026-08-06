import { NextRequest, NextResponse } from "next/server"

import { ACCESS_SESSION_COOKIE, ADMIN_ACCESS_ROLES, verifyAccessSession } from "@/lib/access-auth"
import { ADMIN_SESSION_COOKIE, verifyAdminSession } from "@/lib/admin-auth"
import { createFingerprintEnrollment, FingerprintEnrollmentConflictError } from "@/lib/attendance-ledger"
import { normalizeEnrollmentKey } from "@/lib/attendance-device-contract"
import { normalizeFingerprintIndex, normalizeFingerprintSlot } from "@/lib/fingerprint-device-contract"
import { normalizeDeviceNumber } from "@/lib/device-provisioning"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"
export const revalidate = 0

async function requireAdmin(request: NextRequest) {
  if (verifyAdminSession(request.cookies.get(ADMIN_SESSION_COOKIE)?.value)) return true
  return verifyAccessSession(request.cookies.get(ACCESS_SESSION_COOKIE)?.value, ADMIN_ACCESS_ROLES)
}

function toEnrollment(enrollment: {
  id: string
  deviceId: string
  enrollmentKey: string
  fingerprintSlot: number
  fingerprintIndex: number | null
  state: string
  enabled: boolean
  createdAt: Date
  updatedAt: Date
}) {
  return {
    id: enrollment.id,
    deviceId: enrollment.deviceId,
    enrollmentKey: enrollment.enrollmentKey,
    fingerprintSlot: enrollment.fingerprintSlot,
    fingerprintIndex: enrollment.fingerprintIndex,
    state: enrollment.state,
    enabled: enrollment.enabled,
    createdAt: enrollment.createdAt.toISOString(),
    updatedAt: enrollment.updatedAt.toISOString(),
  }
}

async function findFingerprintDevice(deviceId: string) {
  return prisma.device.findFirst({
    where: { deviceNumber: deviceId, projectType: "qr-biometric", deviceKind: { in: ["TAB5_DISPLAY", "FINGERPRINT_READER"] } },
    select: { deviceNumber: true },
  })
}

export async function GET(request: NextRequest) {
  if (!(await requireAdmin(request))) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
  const deviceId = normalizeDeviceNumber(new URL(request.url).searchParams.get("deviceId"))
  const enrollments = await prisma.fingerprintEnrollment.findMany({
    where: deviceId ? { deviceId } : undefined,
    orderBy: [{ deviceId: "asc" }, { fingerprintSlot: "asc" }],
  })
  return NextResponse.json({ success: true, enrollments: enrollments.map(toEnrollment) })
}

export async function POST(request: NextRequest) {
  if (!(await requireAdmin(request))) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
  const body = await request.json().catch(() => null) as Record<string, unknown> | null
  const deviceId = normalizeDeviceNumber(body?.deviceId)
  const enrollmentKey = normalizeEnrollmentKey(body?.enrollment ?? body?.enrollmentKey)
  const fingerprintSlot = normalizeFingerprintSlot(body?.fingerprintSlot ?? body?.slot)
  const fingerprintIndex = normalizeFingerprintIndex(body?.fingerprintIndex ?? body?.index)
  if (!deviceId || !enrollmentKey || fingerprintSlot === null) {
    return NextResponse.json({ success: false, error: "deviceId, enrollment, and fingerprintSlot are required" }, { status: 400 })
  }

  const device = await findFingerprintDevice(deviceId)
  if (!device) return NextResponse.json({ success: false, error: "Fingerprint device not found" }, { status: 404 })

  try {
    const result = await createFingerprintEnrollment({ deviceId, enrollmentKey, fingerprintSlot, fingerprintIndex })
    return NextResponse.json({ success: true, enrollment: toEnrollment(result.enrollment), commandId: result.command.commandId }, { status: 201 })
  } catch (error) {
    if (error instanceof FingerprintEnrollmentConflictError) return NextResponse.json({ success: false, error: error.message }, { status: 409 })
    console.error("[admin] Fingerprint enrollment creation failed", error)
    return NextResponse.json({ success: false, error: "Fingerprint enrollment storage unavailable" }, { status: 503 })
  }
}

export async function PATCH(request: NextRequest) {
  if (!(await requireAdmin(request))) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
  const body = await request.json().catch(() => null) as Record<string, unknown> | null
  const id = typeof body?.id === "string" ? body.id.trim() : ""
  if (!id || typeof body?.enabled !== "boolean") return NextResponse.json({ success: false, error: "id and enabled are required" }, { status: 400 })
  try {
    const enrollment = await prisma.fingerprintEnrollment.update({
      where: { id },
      data: { enabled: body.enabled, state: body.enabled ? "ACTIVE" : "DISABLED" },
    })
    return NextResponse.json({ success: true, enrollment: toEnrollment(enrollment) })
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Failed to update fingerprint enrollment" }, { status: 404 })
  }
}

export async function DELETE(request: NextRequest) {
  if (!(await requireAdmin(request))) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
  const body = await request.json().catch(() => null) as Record<string, unknown> | null
  const id = typeof body?.id === "string" ? body.id.trim() : ""
  if (!id) return NextResponse.json({ success: false, error: "id is required" }, { status: 400 })
  try {
    await prisma.fingerprintEnrollment.delete({ where: { id } })
    return NextResponse.json({ success: true, deleted: id })
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Failed to delete fingerprint enrollment" }, { status: 404 })
  }
}
