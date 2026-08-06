import { NextRequest, NextResponse } from "next/server"

import { authenticateAttendanceDevice } from "@/lib/attendance-device-auth"
import { FINGERPRINT_COMMAND_BATCH_SIZE, parseFingerprintCommandAck } from "@/lib/fingerprint-device-contract"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"
export const revalidate = 0

const RESPONSE_HEADERS = {
  "cache-control": "private, no-store",
  vary: "Authorization, X-Device-Id",
}

function json(body: object, status = 200) {
  return NextResponse.json(body, { status, headers: RESPONSE_HEADERS })
}

function toCommand(command: {
  commandId: string
  commandType: string
  deviceId: string
  enrollmentKey: string | null
  fingerprintSlot: number | null
  fingerprintIndex: number | null
  payload: unknown
  status: string
  createdAt: Date
  deliveredAt: Date | null
}) {
  return {
    commandId: command.commandId,
    commandType: command.commandType,
    deviceId: command.deviceId,
    enrollmentKey: command.enrollmentKey,
    fingerprintSlot: command.fingerprintSlot,
    fingerprintIndex: command.fingerprintIndex,
    payload: command.payload,
    status: command.status,
    createdAt: command.createdAt.toISOString(),
    deliveredAt: command.deliveredAt?.toISOString() ?? null,
  }
}

export async function GET(request: NextRequest) {
  const auth = await authenticateAttendanceDevice(request.headers, ["TAB5_DISPLAY", "FINGERPRINT_READER"]).catch((error) => {
    console.error("[device-api] Fingerprint command authentication unavailable", error)
    return null
  })
  if (!auth) return json({ success: false, error: "Device authentication temporarily unavailable" }, 503)
  if (!auth.ok) return json({ success: false, error: auth.error }, auth.status)

  try {
    const commands = await prisma.fingerprintCommand.findMany({
      where: { deviceId: auth.device.deviceId, status: { in: ["PENDING", "DELIVERED"] } },
      orderBy: { createdAt: "asc" },
      take: FINGERPRINT_COMMAND_BATCH_SIZE,
    })
    const deliveredAt = new Date()
    if (commands.length > 0) {
      await prisma.fingerprintCommand.updateMany({
        where: { commandId: { in: commands.map((command) => command.commandId) }, status: "PENDING" },
        data: { status: "DELIVERED", deliveredAt },
      })
    }
    return json({ success: true, schemaVersion: 1, serverTime: deliveredAt.toISOString(), commands: commands.map((command) => toCommand({ ...command, status: "DELIVERED", deliveredAt })) })
  } catch (error) {
    console.error("[device-api] Fingerprint command polling unavailable", error)
    return json({ success: false, error: "Fingerprint command queue temporarily unavailable" }, 503)
  }
}

export async function POST(request: NextRequest) {
  const auth = await authenticateAttendanceDevice(request.headers, ["TAB5_DISPLAY", "FINGERPRINT_READER"]).catch((error) => {
    console.error("[device-api] Fingerprint command authentication unavailable", error)
    return null
  })
  if (!auth) return json({ success: false, error: "Device authentication temporarily unavailable" }, 503)
  if (!auth.ok) return json({ success: false, error: auth.error }, auth.status)

  const body = await request.json().catch(() => null)
  const parsed = parseFingerprintCommandAck(body)
  if (!parsed.ok) return json({ success: false, error: parsed.error }, 400)

  try {
    const command = await prisma.fingerprintCommand.findFirst({ where: { commandId: parsed.value.commandId, deviceId: auth.device.deviceId } })
    if (!command) return json({ success: false, error: "Fingerprint command not found" }, 404)
    const completed = parsed.value.status === "COMPLETED" || parsed.value.status === "FAILED"
    const updated = await prisma.$transaction(async (tx) => {
      const updatedCommand = await tx.fingerprintCommand.update({
        where: { commandId: command.commandId },
        data: {
          status: parsed.value.status,
          errorMessage: parsed.value.error,
          ...(completed ? { completedAt: new Date() } : {}),
        },
      })
      if (completed && command.fingerprintSlot !== null) {
        const enrollment = await tx.fingerprintEnrollment.findFirst({
          where: { deviceId: auth.device.deviceId, fingerprintSlot: command.fingerprintSlot },
        })
        if (enrollment && (command.commandType === "ENROLL" || command.commandType === "DELETE")) {
          await tx.fingerprintEnrollment.update({
            where: { id: enrollment.id },
            data: command.commandType === "ENROLL"
              ? parsed.value.status === "COMPLETED"
                ? { state: "ACTIVE", enabled: true }
                : { state: "FAILED", enabled: false }
              : parsed.value.status === "COMPLETED"
                ? { state: "DELETED", enabled: false }
                : { state: "DELETE_FAILED", enabled: true },
          })
        }
      }
      return updatedCommand
    })
    return json({ success: true, commandId: updated.commandId, status: updated.status })
  } catch (error) {
    console.error("[device-api] Fingerprint command acknowledgement unavailable", error)
    return json({ success: false, error: "Fingerprint command acknowledgement temporarily unavailable" }, 503)
  }
}
