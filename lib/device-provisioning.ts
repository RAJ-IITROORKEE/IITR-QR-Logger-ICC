const DEVICE_NUMBER_PATTERN = /^(?:QR|QRB)-[A-Z0-9]{1,27}$/

export function normalizeDeviceNumber(value: unknown): string | null {
  if (typeof value !== "string") return null
  const normalized = value.trim().toUpperCase()
  return DEVICE_NUMBER_PATTERN.test(normalized) ? normalized : null
}
