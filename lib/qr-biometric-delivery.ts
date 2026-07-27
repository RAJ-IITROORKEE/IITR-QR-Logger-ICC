type StoredScanDelivery = {
  deviceId: string
  decodedData: string
}

export function normalizeScanId(value: unknown): string | null {
  if (typeof value !== "string") return null
  const normalized = value.trim().toLowerCase()
  return /^[0-9a-f]{24}$/.test(normalized) ? normalized : null
}

export function resolveScanId(scanId: unknown, eventId: unknown): { supplied: boolean; value: string | null } {
  const rawValue = scanId ?? eventId
  return {
    supplied: rawValue !== null && rawValue !== undefined,
    value: normalizeScanId(rawValue),
  }
}

export function matchesScanDelivery(stored: StoredScanDelivery, deviceId: string, decodedData: string): boolean {
  return stored.deviceId === deviceId && stored.decodedData === decodedData
}
