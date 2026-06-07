import { QrBiometricDashboard } from "@/components/qr-biometric/qr-biometric-dashboard"
import { PublicShell } from "@/components/site/public-shell"

export default function Home() {
  return (
    <PublicShell>
      <QrBiometricDashboard />
    </PublicShell>
  )
}
