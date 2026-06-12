import { NextRequest, NextResponse } from "next/server"

import { ACCESS_SESSION_COOKIE, ADMIN_ACCESS_ROLES, ensureDefaultAccessAccounts, hashAccessPassword, normalizeAccessRole, verifyAccessSession } from "@/lib/access-auth"
import { ADMIN_SESSION_COOKIE, verifyAdminSession } from "@/lib/admin-auth"
import { prisma } from "@/lib/prisma"

async function requireAdmin(request: NextRequest) {
  if (verifyAdminSession(request.cookies.get(ADMIN_SESSION_COOKIE)?.value)) return true
  return verifyAccessSession(request.cookies.get(ACCESS_SESSION_COOKIE)?.value, ADMIN_ACCESS_ROLES)
}

function parseText(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
}

function toAccessAccount(account: { id: string; role: string; name: string; username: string; createdAt: Date; updatedAt: Date }) {
  return {
    id: account.id,
    role: account.role,
    name: account.name,
    username: account.username,
    createdAt: account.createdAt.toISOString(),
    updatedAt: account.updatedAt.toISOString(),
  }
}

export async function GET(request: NextRequest) {
  if (!(await requireAdmin(request))) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })

  await ensureDefaultAccessAccounts()
  const accounts = await prisma.accessAccount.findMany({ orderBy: [{ role: "asc" }, { createdAt: "desc" }] })
  return NextResponse.json({ success: true, accounts: accounts.map(toAccessAccount) })
}

export async function POST(request: NextRequest) {
  if (!(await requireAdmin(request))) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  const role = normalizeAccessRole(body?.role)
  const name = parseText(body?.name)
  const username = parseText(body?.username)
  const password = typeof body?.password === "string" ? body.password : ""

  if (!role || !name || !username || password.length < 6) {
    return NextResponse.json({ success: false, error: "Role, name, username, and a password of at least 6 characters are required." }, { status: 400 })
  }

  try {
    const account = await prisma.accessAccount.create({
      data: { role, name, username, passwordHash: hashAccessPassword(password) },
    })
    return NextResponse.json({ success: true, account: toAccessAccount(account) })
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Failed to create access account" }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  if (!(await requireAdmin(request))) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  const id = parseText(body?.id)
  if (!id) return NextResponse.json({ success: false, error: "Missing access account id" }, { status: 400 })

  const role = body?.role === undefined ? undefined : normalizeAccessRole(body.role)
  const name = body?.name === undefined ? undefined : parseText(body.name)
  const username = body?.username === undefined ? undefined : parseText(body.username)
  const password = typeof body?.password === "string" ? body.password : ""

  if (body?.role !== undefined && !role) return NextResponse.json({ success: false, error: "Invalid role" }, { status: 400 })
  if (body?.name !== undefined && !name) return NextResponse.json({ success: false, error: "Name is required" }, { status: 400 })
  if (body?.username !== undefined && !username) return NextResponse.json({ success: false, error: "Username is required" }, { status: 400 })
  if (password && password.length < 6) return NextResponse.json({ success: false, error: "Password must be at least 6 characters." }, { status: 400 })

  try {
    const account = await prisma.accessAccount.update({
      where: { id },
      data: {
        ...(role ? { role } : {}),
        ...(name ? { name } : {}),
        ...(username ? { username } : {}),
        ...(password ? { passwordHash: hashAccessPassword(password) } : {}),
      },
    })
    return NextResponse.json({ success: true, account: toAccessAccount(account) })
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Failed to update access account" }, { status: 500 })
  }
}
