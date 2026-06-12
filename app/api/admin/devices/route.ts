import { NextRequest, NextResponse } from "next/server"

import { ACCESS_SESSION_COOKIE, ADMIN_ACCESS_ROLES, verifyAccessSession } from "@/lib/access-auth"
import { ADMIN_SESSION_COOKIE, verifyAdminSession } from "@/lib/admin-auth"
import { generateDeviceApiKey, hashDeviceApiKey, previewDeviceApiKey } from "@/lib/device-api-key"
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

async function nextDeviceNumber() {
  const devices = await prisma.device.findMany({
    where: { projectType: "qr-biometric" },
    select: { deviceNumber: true },
  })
  const max = devices.reduce((highest, device) => {
    const match = /^QRB-(\d+)$/i.exec(device.deviceNumber)
    return match ? Math.max(highest, Number.parseInt(match[1], 10)) : highest
  }, 0)

  return `QRB-${String(max + 1).padStart(3, "0")}`
}

function toApiDevice(device: {
  id: string
  deviceNumber: string
  name: string
  projectType: string
  location: string
  firmware: string
  apiKeyPreview: string | null
  apiKeyCreatedAt: Date | null
  apiKeyLastUsedAt: Date | null
  macAddress: string | null
  macAddressLockedAt: Date | null
  lastSeenAt: Date | null
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
    apiKeyPreview: device.apiKeyPreview,
    apiKeyCreatedAt: device.apiKeyCreatedAt?.toISOString() ?? null,
    apiKeyLastUsedAt: device.apiKeyLastUsedAt?.toISOString() ?? null,
    macAddress: device.macAddress,
    macAddressLockedAt: device.macAddressLockedAt?.toISOString() ?? null,
    lastSeenAt: device.lastSeenAt?.toISOString() ?? null,
    createdAt: device.createdAt.toISOString(),
    updatedAt: device.updatedAt.toISOString(),
  }
}

export async function POST(request: NextRequest) {
  if (!(await requireAdmin(request))) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })

  const body = (await request.json().catch(() => null)) as { name?: unknown } | null
  const name = readText(body?.name)
  if (!name) return NextResponse.json({ success: false, error: "Device name is required" }, { status: 400 })

  const apiKey = generateDeviceApiKey()
  const device = await prisma.device.create({
    data: {
      deviceNumber: await nextDeviceNumber(),
      name,
      projectType: "qr-biometric",
      location: "ICC, IIT Roorkee",
      apiKeyHash: hashDeviceApiKey(apiKey),
      apiKeyPreview: previewDeviceApiKey(apiKey),
      apiKeyCreatedAt: new Date(),
    },
  })

  return NextResponse.json({ success: true, device: toApiDevice(device), apiKey })
}

export async function PATCH(request: NextRequest) {
  if (!(await requireAdmin(request))) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })

  const body = (await request.json().catch(() => null)) as { id?: unknown; action?: unknown } | null
  const id = readText(body?.id)
  const action = readText(body?.action)
  if (!id || action !== "regenerate-api-key") return NextResponse.json({ success: false, error: "Invalid regenerate request" }, { status: 400 })

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
