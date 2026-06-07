import { NextRequest, NextResponse } from "next/server"

import {
  ADMIN_SESSION_COOKIE,
  ADMIN_SESSION_MAX_AGE,
  createAdminSessionToken,
  getAdminCredentials,
} from "@/lib/admin-auth"

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as {
    username?: string
    password?: string
  } | null
  const credentials = getAdminCredentials()

  if (body?.username !== credentials.username || body?.password !== credentials.password) {
    return NextResponse.json({ success: false, message: "Invalid admin credentials" }, { status: 401 })
  }

  const response = NextResponse.json({ success: true, redirectTo: "/admin" })
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
