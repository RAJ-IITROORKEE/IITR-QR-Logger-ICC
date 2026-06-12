"use client"

import Image from "next/image"
import { FormEvent, useState } from "react"
import { useRouter } from "next/navigation"
import { LockKeyhole, ShieldCheck } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export default function AdminLoginPage() {
  const router = useRouter()
  const [username, setUsername] = useState("admin-raj")
  const [password, setPassword] = useState("")
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
            <p className="text-xs uppercase tracking-[0.22em] text-orange-300">ICC IIT Roorkee</p>
            <h1 className="text-xl font-semibold">QR LOGGER ICC</h1>
          </div>
        </div>

        <Card className="border-orange-500/20 bg-card/85 shadow-2xl shadow-orange-950/20 backdrop-blur">
          <CardHeader>
            <div className="mb-2 flex size-11 items-center justify-center rounded-xl border border-orange-500/25 bg-orange-500/10 text-orange-300">
              <LockKeyhole className="size-5" />
            </div>
            <CardTitle>Admin Login</CardTitle>
            <CardDescription>Authenticate to access logs, analytics, and support requests.</CardDescription>
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
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                />
              </div>
              {error ? <p className="text-sm font-medium text-red-300">{error}</p> : null}
              <Button className="w-full bg-orange-500 text-black hover:bg-orange-400" disabled={loading}>
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
