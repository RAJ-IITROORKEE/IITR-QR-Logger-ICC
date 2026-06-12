import { NextRequest, NextResponse } from "next/server"

import {
  ADMIN_SESSION_COOKIE,
  ADMIN_SESSION_MAX_AGE,
  createAdminSessionToken,
  getAdminCredentials,
} from "@/lib/admin-auth"
import { ACCESS_SESSION_COOKIE, ACCESS_SESSION_MAX_AGE, authenticateAccessAccount, createAccessSessionToken } from "@/lib/access-auth"

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as {
    username?: string
    password?: string
    mode?: "admin" | "access"
  } | null
  const mode = body?.mode === "admin" ? "admin" : "access"

  if (mode === "admin") {
    const credentials = getAdminCredentials()
    if (body?.username !== credentials.username || body?.password !== credentials.password) {
      return NextResponse.json({ success: false, message: "Invalid admin credentials" }, { status: 401 })
    }

    const response = NextResponse.json({ success: true, redirectTo: "/admin", accountType: "admin" })
    response.cookies.set({
      name: ADMIN_SESSION_COOKIE,
      value: createAdminSessionToken(),
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: ADMIN_SESSION_MAX_AGE,
      path: "/",
    })

    return response
  }

  const username = body?.username?.trim() ?? ""
  const password = body?.password ?? ""
  const account = await authenticateAccessAccount(username, password)
  if (!account) {
    return NextResponse.json({ success: false, message: "Invalid credentials" }, { status: 401 })
  }

  const response = NextResponse.json({ success: true, redirectTo: "/", accountType: account.role })
  response.cookies.set({
    name: ACCESS_SESSION_COOKIE,
    value: createAccessSessionToken(account),
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: ACCESS_SESSION_MAX_AGE,
    path: "/",
  })

  return response
}
