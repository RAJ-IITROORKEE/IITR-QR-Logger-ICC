import { cookies } from "next/headers"
import { redirect } from "next/navigation"

import { AdminShell } from "@/components/admin/admin-shell"
import { ACCESS_SESSION_COOKIE, ADMIN_ACCESS_ROLES, verifyAccessSession } from "@/lib/access-auth"
import { ADMIN_SESSION_COOKIE, verifyAdminSession } from "@/lib/admin-auth"

export default async function ProtectedAdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const cookieStore = await cookies()
  const adminSession = cookieStore.get(ADMIN_SESSION_COOKIE)?.value
  const accessSession = cookieStore.get(ACCESS_SESSION_COOKIE)?.value

  if (!verifyAdminSession(adminSession) && !(await verifyAccessSession(accessSession, ADMIN_ACCESS_ROLES))) {
    redirect("/admin/login")
  }

  return <AdminShell>{children}</AdminShell>
}
