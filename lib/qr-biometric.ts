import type { QrBiometricApiResponse } from "@/types/qr-biometric"

export async function fetchQrBiometricData(limit = 20): Promise<QrBiometricApiResponse | null> {
  try {
    const base = typeof window !== "undefined" ? "" : process.env.NEXT_PUBLIC_APP_URL ?? ""
    const response = await fetch(`${base}/api/qr-biometric?limit=${limit}`, { cache: "no-store" })
    if (!response.ok) return null
    return (await response.json()) as QrBiometricApiResponse
  } catch {
    return null
  }
}

export function formatQrRelativeSeconds(seconds: number | null): string {
  if (seconds === null) return "-"
  if (seconds < 60) return `${seconds}s ago`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  return `${Math.floor(seconds / 3600)}h ago`
}
