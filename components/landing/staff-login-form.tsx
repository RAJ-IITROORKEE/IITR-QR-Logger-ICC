"use client"

import Image from "next/image"
import { useRouter } from "next/navigation"
import { FormEvent, useState } from "react"
import { Eye, EyeOff, Fingerprint, Loader2, LockKeyhole, QrCode, ShieldCheck } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export function StaffLoginForm() {
  const router = useRouter()
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    setError("")

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password, mode: "access" }),
      })
      const result = (await response.json().catch(() => null)) as { redirectTo?: string; message?: string } | null
      if (!response.ok) {
        setError(result?.message ?? "Invalid username or password.")
        return
      }

      router.replace(result?.redirectTo ?? "/")
      router.refresh()
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="panel overflow-hidden">
      <div className="panel-head">
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-md border border-border bg-muted text-brand">
            <LockKeyhole className="size-5" />
          </span>
          <div>
            <h3 className="panel-title text-lg">Staff Login</h3>
            <p className="panel-sub">Staff, professor or super admin access</p>
          </div>
        </div>
        <Image src="/logo.png" alt="QR LOGGER ICC logo" width={40} height={40} className="size-10 object-contain" />
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 p-4 sm:p-5">
        <p className="text-sm leading-6 text-muted-foreground">
          Use an admin-created staff, professor, or super admin access account to open the live QRBiometric dashboard.
        </p>
        <div className="space-y-2">
          <Label htmlFor="staff-username">Username</Label>
          <Input
            id="staff-username"
            autoComplete="username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder="icc-staff"
            className="h-11"
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="staff-password">Password</Label>
          <div className="relative">
            <Input
              id="staff-password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Enter your access password"
              className="h-11 pr-12"
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword((current) => !current)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="absolute right-2 top-1/2 inline-flex size-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
        </div>
        {error ? (
          <p role="alert" className="rounded-md border border-offline-border bg-offline-surface px-3 py-2 text-sm font-medium text-offline">
            {error}
          </p>
        ) : null}
        <Button size="lg" className="h-11 w-full" disabled={loading}>
          {loading ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}
          {loading ? "Checking access..." : "Login to Dashboard"}
        </Button>

        <div className="grid gap-2 rounded-md border border-border bg-muted p-3 text-[0.8rem] text-muted-foreground sm:grid-cols-2">
          <span className="inline-flex items-center gap-2">
            <Fingerprint className="size-3.5 text-brand" />
            Staff/professor/admin access
          </span>
          <span className="inline-flex items-center gap-2">
            <QrCode className="size-3.5 text-brand" />
            Live logger protected
          </span>
        </div>
      </form>
    </div>
  )
}
