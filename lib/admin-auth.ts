import { createHash, timingSafeEqual } from "crypto"

export const ADMIN_SESSION_COOKIE = "qr_logger_admin_session"
export const ADMIN_SESSION_MAX_AGE = 60 * 60 * 8

export function getAdminCredentials() {
  return {
    username: process.env.ADMIN_USERNAME ?? process.env.USERNAME ?? "admin",
    password: process.env.ADMIN_PASSWORD ?? process.env.PASSWORD ?? "admin-icc-password",
  }
}

export function createAdminSessionToken() {
  const { username, password } = getAdminCredentials()
  return createHash("sha256").update(`${username}:${password}`).digest("hex")
}

export function verifyAdminSession(token: string | undefined) {
  if (!token) return false

  const expected = createAdminSessionToken()
  const tokenBuffer = Buffer.from(token)
  const expectedBuffer = Buffer.from(expected)

  return tokenBuffer.length === expectedBuffer.length && timingSafeEqual(tokenBuffer, expectedBuffer)
}
