import { NextRequest, NextResponse } from "next/server"

import { ACCESS_SESSION_COOKIE, ADMIN_ACCESS_ROLES, verifyAccessSession } from "@/lib/access-auth"
import { ADMIN_SESSION_COOKIE, verifyAdminSession } from "@/lib/admin-auth"
import { generateDeviceApiKey, hashDeviceApiKey, previewDeviceApiKey } from "@/lib/device-api-key"
import { normalizeMacAddress } from "@/lib/device-mac-registration"
import { deviceNumberMatchesKind, normalizeDeviceNumber } from "@/lib/device-provisioning"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"
export const revalidate = 0

async function requireAdmin(request: NextRequest) {
  if (verifyAdminSession(request.cookies.get(ADMIN_SESSION_COOKIE)?.value)) return true
  return verifyAccessSession(request.cookies.get(ACCESS_SESSION_COOKIE)?.value, ADMIN_ACCESS_ROLES)
}

function readText(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
}

function readDeviceKind(value: unknown) {
  return value === "TAB5_DISPLAY" ? "TAB5_DISPLAY" : value === "QR_SCANNER" || value == null ? "QR_SCANNER" : null
}

async function nextDeviceNumber(deviceKind: "QR_SCANNER" | "TAB5_DISPLAY") {
  const prefix = deviceKind === "TAB5_DISPLAY" ? "TAB5" : "QRB"
  const devices = await prisma.device.findMany({
    where: { projectType: "qr-biometric" },
    select: { deviceNumber: true },
  })
  const max = devices.reduce((highest, device) => {
    const match = new RegExp(`^${prefix}-(\\d+)$`, "i").exec(device.deviceNumber)
    return match ? Math.max(highest, Number.parseInt(match[1], 10)) : highest
  }, 0)

  return `${prefix}-${String(max + 1).padStart(3, "0")}`
}

function toApiDevice(device: {
  id: string
  deviceNumber: string
  name: string
  projectType: string
  location: string
  firmware: string
  deviceKind: string
  enabled: boolean
  apiVersion: number
  apiKeyPreview: string | null
  apiKeyCreatedAt: Date | null
  apiKeyLastUsedAt: Date | null
  macAddress: string | null
  macAddressLockedAt: Date | null
  lastSeenAt: Date | null
  lastHeartbeatAt: Date | null
  disabledAt: Date | null
  createdAt: Date
  updatedAt: Date
}) {
  return {
    id: device.id,
    deviceNumber: device.deviceNumber,
    name: device.name,
    projectType: device.projectType,
    location: device.location,
    firmware: device.firmware,
    deviceKind: device.deviceKind,
    enabled: device.enabled,
    apiVersion: device.apiVersion,
    apiKeyPreview: device.apiKeyPreview,
    apiKeyCreatedAt: device.apiKeyCreatedAt?.toISOString() ?? null,
    apiKeyLastUsedAt: device.apiKeyLastUsedAt?.toISOString() ?? null,
    macAddress: device.macAddress,
    macAddressLockedAt: device.macAddressLockedAt?.toISOString() ?? null,
    lastSeenAt: device.lastSeenAt?.toISOString() ?? null,
    lastHeartbeatAt: device.lastHeartbeatAt?.toISOString() ?? null,
    disabledAt: device.disabledAt?.toISOString() ?? null,
    createdAt: device.createdAt.toISOString(),
    updatedAt: device.updatedAt.toISOString(),
  }
}

export async function POST(request: NextRequest) {
  if (!(await requireAdmin(request))) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })

  const body = (await request.json().catch(() => null)) as { name?: unknown; deviceNumber?: unknown; macAddress?: unknown; deviceKind?: unknown } | null
  const name = readText(body?.name)
  if (!name) return NextResponse.json({ success: false, error: "Device name is required" }, { status: 400 })
  const deviceKind = readDeviceKind(body?.deviceKind)
  if (!deviceKind) return NextResponse.json({ success: false, error: "Invalid device kind" }, { status: 400 })

  const requestedDeviceNumber = body?.deviceNumber == null ? null : normalizeDeviceNumber(body.deviceNumber)
  if (body?.deviceNumber != null && !requestedDeviceNumber) {
    return NextResponse.json({ success: false, error: "Invalid device ID. Use QR-102, QRB-002, or TAB5-001 format." }, { status: 400 })
  }
  if (requestedDeviceNumber && !deviceNumberMatchesKind(requestedDeviceNumber, deviceKind)) {
    return NextResponse.json({ success: false, error: deviceKind === "TAB5_DISPLAY" ? "Tab5 device IDs must use TAB5-..." : "QR scanner IDs must use QR-... or QRB-..." }, { status: 400 })
  }

  const requestedMac = body?.macAddress == null || readText(body.macAddress) === "" ? null : normalizeMacAddress(body.macAddress)
  if (body?.macAddress != null && !requestedMac) {
    return NextResponse.json({ success: false, error: "Invalid MAC address." }, { status: 400 })
  }

  const deviceNumber = requestedDeviceNumber ?? await nextDeviceNumber(deviceKind)
  const existingDevice = await prisma.device.findFirst({
    where: {
      projectType: "qr-biometric",
      OR: [
        { deviceNumber },
        ...(requestedMac ? [{ macAddress: requestedMac }] : []),
      ],
    },
    select: { deviceNumber: true, macAddress: true },
  })
  if (existingDevice) {
    const duplicate = existingDevice.deviceNumber === deviceNumber ? `Device ID ${deviceNumber} is already registered.` : `MAC address is already locked to ${existingDevice.deviceNumber}.`
    return NextResponse.json({ success: false, error: duplicate }, { status: 409 })
  }

  const apiKey = generateDeviceApiKey()
  try {
    const now = new Date()
    const device = await prisma.device.create({
      data: {
        deviceNumber,
        name,
        projectType: "qr-biometric",
        deviceKind,
        location: "ICC, IIT Roorkee",
        apiKeyHash: hashDeviceApiKey(apiKey),
        apiKeyPreview: previewDeviceApiKey(apiKey),
        apiKeyCreatedAt: now,
        ...(requestedMac ? { macAddress: requestedMac, macAddressLockedAt: now } : {}),
      },
    })

    return NextResponse.json({ success: true, device: toApiDevice(device), apiKey })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create device"
    return NextResponse.json({ success: false, error: message.includes("Unique constraint") ? "Device ID or MAC address is already registered." : message }, { status: 409 })
  }
}

export async function GET(request: NextRequest) {
  if (!(await requireAdmin(request))) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })

  const devices = await prisma.device.findMany({ where: { projectType: "qr-biometric" }, orderBy: { createdAt: "desc" } })
  return NextResponse.json({ success: true, devices: devices.map(toApiDevice) })
}

export async function PATCH(request: NextRequest) {
  if (!(await requireAdmin(request))) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })

  const body = (await request.json().catch(() => null)) as { id?: unknown; action?: unknown } | null
  const id = readText(body?.id)
  const action = readText(body?.action)
  if (!id || !["regenerate-api-key", "enable", "disable"].includes(action)) return NextResponse.json({ success: false, error: "Invalid device update request" }, { status: 400 })

  if (action === "enable" || action === "disable") {
    const enabled = action === "enable"
    const device = await prisma.device.update({
      where: { id },
      data: { enabled, disabledAt: enabled ? null : new Date() },
    })
    return NextResponse.json({ success: true, device: toApiDevice(device) })
  }

  const apiKey = generateDeviceApiKey()
  const device = await prisma.device.update({
    where: { id },
    data: {
      apiKeyHash: hashDeviceApiKey(apiKey),
      apiKeyPreview: previewDeviceApiKey(apiKey),
      apiKeyCreatedAt: new Date(),
      apiKeyLastUsedAt: null,
    },
  })

  return NextResponse.json({ success: true, device: toApiDevice(device), apiKey })
}
