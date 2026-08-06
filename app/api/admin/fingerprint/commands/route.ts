import { randomUUID } from "node:crypto"
import type { Prisma } from "@prisma/client"
import { NextRequest, NextResponse } from "next/server"

import { ACCESS_SESSION_COOKIE, ADMIN_ACCESS_ROLES, verifyAccessSession } from "@/lib/access-auth"
import { ADMIN_SESSION_COOKIE, verifyAdminSession } from "@/lib/admin-auth"
import { normalizeDeviceNumber } from "@/lib/device-provisioning"
import { parseFingerprintCommandRequest } from "@/lib/fingerprint-device-contract"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"
export const revalidate = 0

async function requireAdmin(request: NextRequest) {
  if (verifyAdminSession(request.cookies.get(ADMIN_SESSION_COOKIE)?.value)) return true
  return verifyAccessSession(request.cookies.get(ACCESS_SESSION_COOKIE)?.value, ADMIN_ACCESS_ROLES)
}

function toCommand(command: {
  id: string
  commandId: string
  deviceId: string
  commandType: string
  enrollmentKey: string | null
  fingerprintSlot: number | null
  fingerprintIndex: number | null
  payload: unknown
  status: string
  errorMessage: string | null
  deliveredAt: Date | null
  completedAt: Date | null
  createdAt: Date
  updatedAt: Date
}) {
  return {
    id: command.id,
    commandId: command.commandId,
    deviceId: command.deviceId,
    commandType: command.commandType,
    enrollmentKey: command.enrollmentKey,
    fingerprintSlot: command.fingerprintSlot,
    fingerprintIndex: command.fingerprintIndex,
    payload: command.payload,
    status: command.status,
    errorMessage: command.errorMessage,
    deliveredAt: command.deliveredAt?.toISOString() ?? null,
    completedAt: command.completedAt?.toISOString() ?? null,
    createdAt: command.createdAt.toISOString(),
    updatedAt: command.updatedAt.toISOString(),
  }
}

export async function GET(request: NextRequest) {
  if (!(await requireAdmin(request))) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
  const url = new URL(request.url)
  const deviceId = normalizeDeviceNumber(url.searchParams.get("deviceId"))
  const status = url.searchParams.get("status")
  const commands = await prisma.fingerprintCommand.findMany({
    where: { ...(deviceId ? { deviceId } : {}), ...(status ? { status } : {}) },
    orderBy: { createdAt: "desc" },
    take: 200,
  })
  return NextResponse.json({ success: true, commands: commands.map(toCommand) })
}

export async function POST(request: NextRequest) {
  if (!(await requireAdmin(request))) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
  const body = await request.json().catch(() => null) as Record<string, unknown> | null
  const deviceId = normalizeDeviceNumber(body?.deviceId)
  if (!deviceId) return NextResponse.json({ success: false, error: "Valid deviceId is required" }, { status: 400 })
  const parsed = parseFingerprintCommandRequest(body)
  if (!parsed.ok) return NextResponse.json({ success: false, error: parsed.error }, { status: 400 })

  const device = await prisma.device.findFirst({
    where: { deviceNumber: deviceId, projectType: "qr-biometric", deviceKind: { in: ["TAB5_DISPLAY", "FINGERPRINT_READER"] } },
    select: { deviceNumber: true },
  })
  if (!device) return NextResponse.json({ success: false, error: "Fingerprint device not found" }, { status: 404 })

  const command = await prisma.fingerprintCommand.create({
    data: {
      commandId: `fp:${randomUUID()}`,
      deviceId,
      commandType: parsed.value.commandType,
      enrollmentKey: parsed.value.enrollmentKey,
      fingerprintSlot: parsed.value.fingerprintSlot,
      fingerprintIndex: parsed.value.fingerprintIndex,
      payload: parsed.value.payload as Prisma.InputJsonValue,
    },
  })
  return NextResponse.json({ success: true, command: toCommand(command) }, { status: 201 })
}
