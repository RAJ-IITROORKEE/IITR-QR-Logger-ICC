import { createHmac, timingSafeEqual } from "node:crypto"

export const PROTOCOL_VERSION = 1
export const MAX_MESSAGE_BYTES = 16 * 1024
export const MAX_DECODED_DATA_BYTES = 512

const DEVICE_ID_PATTERN = /^(?:QR|QRB|TAB5)-[A-Z0-9]{1,27}$/
const API_KEY_PATTERN = /^qlicc_[A-Za-z0-9_-]{40,128}$/
const MAC_PATTERN = /^(?:[0-9A-F]{2}:){5}[0-9A-F]{2}$/
const SCAN_ID_PATTERN = /^[0-9a-f]{24}$/i

export function validateAuthMessage(value) {
  if (!value || value.v !== PROTOCOL_VERSION || value.type !== "auth") return { ok: false, error: "Invalid authentication message" }
  if (value.role === "scanner") {
    const deviceId = typeof value.deviceId === "string" ? value.deviceId.trim().toUpperCase() : ""
    const apiKey = typeof value.apiKey === "string" ? value.apiKey : ""
    const macAddress = typeof value.macAddress === "string" ? value.macAddress.trim().toUpperCase() : ""
    if (!DEVICE_ID_PATTERN.test(deviceId) || !API_KEY_PATTERN.test(apiKey) || !MAC_PATTERN.test(macAddress)) {
      return { ok: false, error: "Invalid scanner credentials" }
    }
    return { ok: true, value: { role: "scanner", deviceId, apiKey, macAddress } }
  }
  if ((value.role === "dashboard" || value.role === "display") && typeof value.token === "string" && value.token.length <= 4096) {
    return { ok: true, value: { role: value.role, token: value.token } }
  }
  return { ok: false, error: "Invalid authentication role" }
}

export function validateScanMessage(value) {
  if (!value || value.v !== PROTOCOL_VERSION || value.type !== "scan.submit") return { ok: false, error: "Invalid scan message" }
  const scanId = typeof value.scanId === "string" ? value.scanId.toLowerCase() : ""
  const decodedData = typeof value.decodedData === "string" ? value.decodedData.trim() : ""
  if (!SCAN_ID_PATTERN.test(scanId) || !decodedData || Buffer.byteLength(decodedData) > MAX_DECODED_DATA_BYTES) {
    return { ok: false, error: "Invalid scan payload" }
  }
  return { ok: true, value: { scanId, decodedData } }
}

export function durableAcknowledgement(status, body, scanId) {
  return status >= 200 && status < 300
    && body?.success === true
    && body?.scanId === scanId
    && body?.persistence?.status === "saved"
}

export function verifyAudienceToken(token, secret, role, nowSeconds = Math.floor(Date.now() / 1000)) {
  if (typeof secret !== "string" || Buffer.byteLength(secret) < 32 || typeof token !== "string" || token.length > 4096) return null
  const [encoded, presented, extra] = token.split(".")
  if (!encoded || !presented || extra) return null
  const expected = createHmac("sha256", secret).update(encoded).digest("base64url")
  const actualBytes = Buffer.from(presented)
  const expectedBytes = Buffer.from(expected)
  if (actualBytes.length !== expectedBytes.length || !timingSafeEqual(actualBytes, expectedBytes)) return null
  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"))
    if (payload?.v !== 1 || payload?.aud !== "qr-realtime-relay" || payload?.role !== role) return null
    if (!Number.isSafeInteger(payload.iat) || !Number.isSafeInteger(payload.exp) || typeof payload.nonce !== "string") return null
    if (payload.iat > nowSeconds + 10 || payload.exp < nowSeconds || payload.exp - payload.iat !== 60) return null
    return payload
  } catch {
    return null
  }
}
