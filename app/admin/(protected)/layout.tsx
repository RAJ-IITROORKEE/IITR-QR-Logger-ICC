import { cookies } from "next/headers"
import { redirect } from "next/navigation"

import { AdminShell } from "@/components/admin/admin-shell"
import { ADMIN_SESSION_COOKIE, verifyAdminSession } from "@/lib/admin-auth"

export default async function ProtectedAdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const cookieStore = await cookies()
  const session = cookieStore.get(ADMIN_SESSION_COOKIE)?.value

  if (!verifyAdminSession(session)) {
    redirect("/admin/login")
  }

  return <AdminShell>{children}</AdminShell>
}
