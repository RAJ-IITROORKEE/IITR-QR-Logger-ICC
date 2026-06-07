import { createHash, randomBytes, timingSafeEqual } from "crypto"

const API_KEY_PREFIX = "qlicc"

export function generateDeviceApiKey() {
  return `${API_KEY_PREFIX}_${randomBytes(32).toString("base64url")}`
}

export function hashDeviceApiKey(apiKey: string) {
  return createHash("sha256").update(apiKey).digest("hex")
}

export function previewDeviceApiKey(apiKey: string) {
  return `${apiKey.slice(0, 10)}...${apiKey.slice(-6)}`
}

export function verifyDeviceApiKey(apiKey: string, hash: string | null | undefined) {
  if (!apiKey || !hash) return false

  const actual = Buffer.from(hashDeviceApiKey(apiKey))
  const expected = Buffer.from(hash)
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}
