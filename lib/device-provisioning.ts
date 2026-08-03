const DEVICE_NUMBER_PATTERN = /^(?:QR|QRB|TAB5)-[A-Z0-9]{1,27}$/

export function normalizeDeviceNumber(value: unknown): string | null {
  if (typeof value !== "string") return null
  const normalized = value.trim().toUpperCase()
  return DEVICE_NUMBER_PATTERN.test(normalized) ? normalized : null
}

export function deviceNumberMatchesKind(deviceNumber: string, deviceKind: "QR_SCANNER" | "TAB5_DISPLAY"): boolean {
  return deviceKind === "TAB5_DISPLAY" ? deviceNumber.startsWith("TAB5-") : /^(?:QR|QRB)-/.test(deviceNumber)
}
