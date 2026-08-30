import { createHmac, randomBytes, timingSafeEqual } from "crypto"

export type RealtimeRelayRole = "dashboard" | "display"

type RealtimeRelayTokenPayload = {
  v: 1
  aud: "qr-realtime-relay"
  role: RealtimeRelayRole
  iat: number
  exp: number
  nonce: string
}

const TOKEN_LIFETIME_SECONDS = 60
const MINIMUM_SECRET_BYTES = 32

function validSecret(secret: string) {
  return Buffer.byteLength(secret) >= MINIMUM_SECRET_BYTES
}

function signature(encodedPayload: string, secret: string) {
  return createHmac("sha256", secret).update(encodedPayload).digest("base64url")
}

export function createRealtimeRelayToken(
  secret: string,
  role: RealtimeRelayRole,
  nowMs = Date.now(),
  nonce = randomBytes(12).toString("base64url"),
) {
  if (!validSecret(secret)) throw new Error("QR_RELAY_TOKEN_SECRET must contain at least 32 bytes")
  const issuedAt = Math.floor(nowMs / 1000)
  const payload: RealtimeRelayTokenPayload = {
    v: 1,
    aud: "qr-realtime-relay",
    role,
    iat: issuedAt,
    exp: issuedAt + TOKEN_LIFETIME_SECONDS,
    nonce,
  }
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url")
  return `${encodedPayload}.${signature(encodedPayload, secret)}`
}

export function verifyRealtimeRelayToken(
  token: string,
  secret: string,
  expectedRole: RealtimeRelayRole,
  nowMs = Date.now(),
): RealtimeRelayTokenPayload | null {
  if (!validSecret(secret) || !token || token.length > 4096) return null
  const [encodedPayload, presentedSignature, extra] = token.split(".")
  if (!encodedPayload || !presentedSignature || extra) return null
  const actual = Buffer.from(presentedSignature)
  const expected = Buffer.from(signature(encodedPayload, secret))
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as Partial<RealtimeRelayTokenPayload>
    const now = Math.floor(nowMs / 1000)
    const issuedAt = payload.iat
    const expiresAt = payload.exp
    if (payload.v !== 1 || payload.aud !== "qr-realtime-relay" || payload.role !== expectedRole) return null
    if (typeof issuedAt !== "number" || typeof expiresAt !== "number" || !Number.isSafeInteger(issuedAt) || !Number.isSafeInteger(expiresAt) || typeof payload.nonce !== "string") return null
    if (issuedAt > now + 10 || expiresAt < now || expiresAt - issuedAt !== TOKEN_LIFETIME_SECONDS) return null
    return payload as RealtimeRelayTokenPayload
  } catch {
    return null
  }
}
