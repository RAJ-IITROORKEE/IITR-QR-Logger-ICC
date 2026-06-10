export type DeviceMacRecord = {
  macAddress: string | null
  macAddressLockedAt: Date | null
}

export type DeviceMacRegistrationResult =
  | {
      ok: true
      status: "registered" | "verified"
      macAddress: string
      updateData: {
        macAddress?: string
        macAddressLockedAt?: Date
        lastSeenAt: Date
        apiKeyLastUsedAt: Date
      }
    }
  | {
      ok: false
      status: "invalid" | "conflict"
      error: string
      macAddress: string | null
      lockedMacAddress?: string
    }

export function normalizeMacAddress(value: unknown): string | null {
  if (typeof value !== "string") return null

  const compact = value.trim().replace(/[-:.]/g, "").toUpperCase()
  if (!/^[0-9A-F]{12}$/.test(compact)) return null

  return compact.match(/.{2}/g)?.join(":") ?? null
}

export function resolveDeviceMacRegistration(device: DeviceMacRecord, rawMacAddress: unknown, now = new Date()): DeviceMacRegistrationResult {
  const macAddress = normalizeMacAddress(rawMacAddress)
  if (!macAddress) {
    return { ok: false, status: "invalid", error: "Invalid MAC address", macAddress: null }
  }

  const lockedMacAddress = normalizeMacAddress(device.macAddress)
  if (lockedMacAddress && lockedMacAddress !== macAddress) {
    return {
      ok: false,
      status: "conflict",
      error: "Device MAC does not match the locked registration",
      macAddress,
      lockedMacAddress,
    }
  }

  if (lockedMacAddress) {
    return {
      ok: true,
      status: "verified",
      macAddress: lockedMacAddress,
      updateData: { lastSeenAt: now, apiKeyLastUsedAt: now },
    }
  }

  return {
    ok: true,
    status: "registered",
    macAddress,
    updateData: {
      macAddress,
      macAddressLockedAt: device.macAddressLockedAt ?? now,
      lastSeenAt: now,
      apiKeyLastUsedAt: now,
    },
  }
}
