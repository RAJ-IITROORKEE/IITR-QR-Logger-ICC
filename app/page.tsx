import { cookies } from "next/headers"

import { QrBiometricDashboard } from "@/components/qr-biometric/qr-biometric-dashboard"
import { HomeHeroLogin } from "@/components/site/home-hero-login"
import { PublicShell } from "@/components/site/public-shell"
import { ACCESS_SESSION_COOKIE, verifyAccessSession } from "@/lib/access-auth"
import { ADMIN_SESSION_COOKIE, verifyAdminSession } from "@/lib/admin-auth"

export const dynamic = "force-dynamic"

export default async function Home() {
  const cookieStore = await cookies()
  const adminSession = cookieStore.get(ADMIN_SESSION_COOKIE)?.value
  const accessSession = cookieStore.get(ACCESS_SESSION_COOKIE)?.value
  const authenticated = verifyAdminSession(adminSession) || (await verifyAccessSession(accessSession))

  return (
    <PublicShell authenticated={authenticated}>
      {authenticated ? <QrBiometricDashboard /> : <HomeHeroLogin />}
    </PublicShell>
  )
}
