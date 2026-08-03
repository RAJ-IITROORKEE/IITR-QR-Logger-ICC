import "server-only"

import { parseAttendanceDeviceCredentials } from "@/lib/attendance-device-auth-contract"
import { verifyDeviceApiKey } from "@/lib/device-api-key"
import { prisma } from "@/lib/prisma"

export type AuthenticatedAttendanceDevice = {
  id: string
  deviceId: string
  deviceKind: string
  firmwareVersion: string
  apiVersion: number
}

export type AttendanceDeviceAuthResult =
  | { ok: true; device: AuthenticatedAttendanceDevice }
  | { ok: false; status: 401 | 403; error: string }

const LAST_USED_WRITE_INTERVAL_MS = 60_000

export async function authenticateAttendanceDevice(headers: Headers, allowedKinds: string[] = ["TAB5_DISPLAY"]): Promise<AttendanceDeviceAuthResult> {
  const credentials = parseAttendanceDeviceCredentials(headers)
  if (!credentials) return { ok: false, status: 401, error: "Invalid device credentials" }

  const device = await prisma.device.findFirst({
    where: { deviceNumber: credentials.deviceId, projectType: "qr-biometric" },
    select: {
      id: true,
      deviceNumber: true,
      deviceKind: true,
      enabled: true,
      disabledAt: true,
      firmware: true,
      apiVersion: true,
      apiKeyHash: true,
      apiKeyLastUsedAt: true,
    },
  })
  if (!device || !verifyDeviceApiKey(credentials.apiKey, device.apiKeyHash)) {
    return { ok: false, status: 401, error: "Invalid device credentials" }
  }
  if (!device.enabled || device.disabledAt || !allowedKinds.includes(device.deviceKind)) {
    return { ok: false, status: 403, error: "Device is not authorized for this endpoint" }
  }

  const now = new Date()
  if (!device.apiKeyLastUsedAt || now.getTime() - device.apiKeyLastUsedAt.getTime() >= LAST_USED_WRITE_INTERVAL_MS) {
    await prisma.device.updateMany({
      where: {
        id: device.id,
        OR: [{ apiKeyLastUsedAt: null }, { apiKeyLastUsedAt: { lt: new Date(now.getTime() - LAST_USED_WRITE_INTERVAL_MS) } }],
      },
      data: { apiKeyLastUsedAt: now, lastSeenAt: now, lastHeartbeatAt: now },
    })
  }

  return {
    ok: true,
    device: {
      id: device.id,
      deviceId: device.deviceNumber,
      deviceKind: device.deviceKind,
      firmwareVersion: device.firmware,
      apiVersion: device.apiVersion,
    },
  }
}
