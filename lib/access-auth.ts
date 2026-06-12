import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "crypto"

import { prisma } from "@/lib/prisma"

export const ACCESS_SESSION_COOKIE = "qr_logger_access_session"
export const ACCESS_SESSION_MAX_AGE = 60 * 60 * 8

export type AccessRole = "staff" | "professor" | "super-admin"
export const ADMIN_ACCESS_ROLES = ["professor", "super-admin"] satisfies AccessRole[]

type AccessAccountSession = {
  id: string
  passwordHash: string
}

function getDefaultAccessAccounts(): Array<{ role: AccessRole; name: string; username: string; password: string }> {
  const accounts: Array<{ role: AccessRole; name: string; username: string; password: string }> = [
    { role: "staff", name: "ICC Staff 1", username: process.env.ACCESS_STAFF_1_USERNAME ?? "icc-staff-1", password: process.env.ACCESS_STAFF_1_PASSWORD ?? "" },
    { role: "staff", name: "ICC Staff 2", username: process.env.ACCESS_STAFF_2_USERNAME ?? "icc-staff-2", password: process.env.ACCESS_STAFF_2_PASSWORD ?? "" },
    { role: "staff", name: "ICC Staff 3", username: process.env.ACCESS_STAFF_3_USERNAME ?? "icc-staff-3", password: process.env.ACCESS_STAFF_3_PASSWORD ?? "" },
    { role: "super-admin", name: "Super Admin", username: process.env.ACCESS_SUPER_ADMIN_USERNAME ?? "", password: process.env.ACCESS_SUPER_ADMIN_PASSWORD ?? "" },
  ]

  return accounts.filter((account) => account.username && account.password)
}

function sessionSecret() {
  return process.env.ACCESS_SESSION_SECRET ?? process.env.ADMIN_PASSWORD ?? "qr-logger-access-session"
}

export function normalizeAccessRole(value: unknown): AccessRole | null {
  return value === "staff" || value === "professor" || value === "super-admin" ? value : null
}

export function canAccessAdminPanel(role: unknown) {
  return role === "professor" || role === "super-admin"
}

export function hashAccessPassword(password: string) {
  const salt = randomBytes(16).toString("hex")
  const key = scryptSync(password, salt, 64).toString("hex")
  return `scrypt$${salt}$${key}`
}

export function verifyAccessPassword(password: string, storedHash: string) {
  const [scheme, salt, key] = storedHash.split("$")
  if (scheme !== "scrypt" || !salt || !key) return false

  const candidate = Buffer.from(scryptSync(password, salt, 64).toString("hex"))
  const expected = Buffer.from(key)
  return candidate.length === expected.length && timingSafeEqual(candidate, expected)
}

function passwordFingerprint(passwordHash: string) {
  return createHmac("sha256", sessionSecret()).update(passwordHash).digest("hex").slice(0, 32)
}

function signAccessSession(id: string, fingerprint: string) {
  return createHmac("sha256", sessionSecret()).update(`${id}:${fingerprint}`).digest("hex")
}

export function createAccessSessionToken(account: AccessAccountSession) {
  const fingerprint = passwordFingerprint(account.passwordHash)
  return `${account.id}.${fingerprint}.${signAccessSession(account.id, fingerprint)}`
}

export async function ensureDefaultAccessAccounts() {
  for (const account of getDefaultAccessAccounts()) {
    const existing = await prisma.accessAccount.findUnique({ where: { username: account.username }, select: { id: true } })
    if (!existing) {
      await prisma.accessAccount.create({
        data: {
          role: account.role,
          name: account.name,
          username: account.username,
          passwordHash: hashAccessPassword(account.password),
        },
      })
    }
  }
}

export async function authenticateAccessAccount(username: string, password: string) {
  await ensureDefaultAccessAccounts()

  const account = await prisma.accessAccount.findUnique({ where: { username } })
  if (!account || !verifyAccessPassword(password, account.passwordHash)) return null

  return account
}

export async function verifyAccessSession(token: string | undefined, allowedRoles?: readonly AccessRole[]) {
  if (!token) return false

  const [id, fingerprint, signature] = token.split(".")
  if (!id || !fingerprint || !signature) return false

  const expectedSignature = signAccessSession(id, fingerprint)
  const signatureBuffer = Buffer.from(signature)
  const expectedBuffer = Buffer.from(expectedSignature)
  if (signatureBuffer.length !== expectedBuffer.length || !timingSafeEqual(signatureBuffer, expectedBuffer)) return false

  try {
    const account = await prisma.accessAccount.findUnique({ where: { id }, select: { passwordHash: true, role: true } })
    if (!account || passwordFingerprint(account.passwordHash) !== fingerprint) return false

    return allowedRoles ? allowedRoles.includes(account.role as AccessRole) : true
  } catch (error) {
    console.error("[access-auth] Failed to verify access session", error)
    return false
  }
}
