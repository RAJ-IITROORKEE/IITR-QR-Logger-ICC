"use client"

import Image from "next/image"
import { FormEvent, useState } from "react"
import { useRouter } from "next/navigation"
import { Eye, EyeOff, LockKeyhole, ShieldCheck } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export default function AdminLoginPage() {
  const router = useRouter()
  const [username, setUsername] = useState("admin-raj")
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
        body: JSON.stringify({ username, password, mode: "admin" }),
      })

      if (!response.ok) {
        setError("Invalid username or password.")
        return
      }

      router.replace("/admin")
      router.refresh()
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center justify-center gap-3 text-center">
          <span className="flex size-16 items-center justify-center">
            <Image src="/logo.png" alt="QR LOGGER ICC logo" width={64} height={64} className="size-16 object-contain" priority />
          </span>
          <div className="text-left">
            <p className="eyebrow">ICC IIT Roorkee</p>
            <h1 className="text-xl font-semibold">QR LOGGER ICC</h1>
          </div>
        </div>

        <Card className="panel gap-4 py-5 shadow-none">
          <CardHeader>
            <div className="mb-2 flex size-10 items-center justify-center rounded-md border border-border bg-muted text-brand">
              <LockKeyhole className="size-5" />
            </div>
            <CardTitle>Admin Login</CardTitle>
            <CardDescription>Use admin credentials or a professor/super admin access account.</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={handleSubmit}>
              <div className="space-y-2">
                <Label htmlFor="username">Username</Label>
                <Input
                  id="username"
                  autoComplete="username"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className="pr-12"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((current) => !current)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    className="absolute right-3 top-1/2 inline-flex size-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition hover:bg-accent hover:text-foreground"
                  >
                    {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              </div>
              {error ? <p className="rounded-md border border-offline-border bg-offline-surface px-3 py-2 text-sm text-offline">{error}</p> : null}
              <Button className="w-full" disabled={loading}>
                <ShieldCheck className="size-4" />
                {loading ? "Checking..." : "Enter Admin Dashboard"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
