const DEVICE_ID_PATTERN = /^(?:QR|QRB|TAB5)-[A-Z0-9]{1,27}$/
const DEVICE_API_KEY_PATTERN = /^qlicc_[A-Za-z0-9_-]{43}$/

type HeaderReader = {
  get(name: string): string | null
}

export function parseAttendanceDeviceCredentials(headers: HeaderReader): { deviceId: string; apiKey: string } | null {
  const deviceId = headers.get("x-device-id")?.trim().toUpperCase() ?? ""
  const authorization = headers.get("authorization")?.trim() ?? ""
  const match = /^Bearer ([^\s]+)$/.exec(authorization)
  if (!DEVICE_ID_PATTERN.test(deviceId) || !match || !DEVICE_API_KEY_PATTERN.test(match[1])) return null
  return { deviceId, apiKey: match[1] }
}
