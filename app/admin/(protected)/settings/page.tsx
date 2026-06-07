import { AdminDeviceSettings } from "@/components/admin/admin-device-settings"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

type DeviceSummary = {
  deviceId: string
  totalScans: number
  lastSeen: string
  latestState: string
}

async function getSettingsData() {
  try {
    const [registeredDevices, latestReadings] = await Promise.all([
      prisma.device.findMany({
        where: { projectType: "qr-biometric" },
        orderBy: { createdAt: "desc" },
      }),
      prisma.qrBiometricReading.findMany({
        orderBy: { createdAt: "desc" },
        take: 500,
      }),
    ])

    const deviceMap = new Map<string, DeviceSummary>()
    for (const reading of latestReadings) {
      const existing = deviceMap.get(reading.deviceId)
      if (existing) {
        existing.totalScans += 1
        continue
      }

      deviceMap.set(reading.deviceId, {
        deviceId: reading.deviceId,
        totalScans: 1,
        lastSeen: reading.createdAt.toISOString(),
        latestState: reading.entryState,
      })
    }

    return {
      ok: true,
      registeredDevices: registeredDevices.map((device) => ({
        id: device.id,
        deviceNumber: device.deviceNumber,
        name: device.name,
        projectType: device.projectType,
        location: device.location,
        firmware: device.firmware,
        apiKeyPreview: device.apiKeyPreview,
        apiKeyCreatedAt: device.apiKeyCreatedAt?.toISOString() ?? null,
        apiKeyLastUsedAt: device.apiKeyLastUsedAt?.toISOString() ?? null,
        createdAt: device.createdAt.toISOString(),
        updatedAt: device.updatedAt.toISOString(),
      })),
      observedDevices: Array.from(deviceMap.values()),
      error: null,
    }
  } catch (error) {
    return {
      ok: false,
      registeredDevices: [],
      observedDevices: [],
      error: error instanceof Error ? error.message : "Unable to load device settings",
    }
  }
}

export default async function AdminSettingsPage() {
  const data = await getSettingsData()
  return <AdminDeviceSettings initialData={data} />
}
