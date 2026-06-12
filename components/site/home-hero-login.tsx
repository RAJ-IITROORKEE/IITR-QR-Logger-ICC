"use client"

import Image from "next/image"
import { useRouter } from "next/navigation"
import { FormEvent, useState } from "react"
import { ArrowRight, Eye, EyeOff, Fingerprint, Loader2, LockKeyhole, QrCode, ShieldCheck, Sparkles } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export function HomeHeroLogin() {
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
    <main className="relative isolate min-h-[calc(100svh-4rem)] overflow-hidden">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_18%_18%,rgba(249,115,22,0.24),transparent_32%),radial-gradient(circle_at_82%_8%,rgba(251,146,60,0.18),transparent_30%),linear-gradient(135deg,rgba(24,13,6,0.96),rgba(8,8,10,0.98)_58%,rgba(31,16,8,0.96))]" />
      <div className="pointer-events-none absolute left-1/2 top-12 -z-10 size-[34rem] -translate-x-1/2 rounded-full border border-orange-300/10 bg-orange-500/10 blur-3xl animate-pulse" />
      <div className="mx-auto grid w-full max-w-7xl items-center gap-10 px-4 py-10 text-orange-50 sm:px-6 lg:min-h-[calc(100svh-8rem)] lg:grid-cols-[1.1fr_0.9fr] lg:px-8 lg:py-16">
        <section className="relative">
          <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-orange-300/25 bg-orange-300/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-orange-100 shadow-[0_0_40px_rgba(249,115,22,0.18)]">
            <Sparkles className="size-3.5" />
            ICC Secure QR Logger
          </div>
          <h1 className="max-w-4xl text-5xl font-black tracking-tight text-orange-50 sm:text-6xl lg:text-7xl">
            QR based student logger for secure campus movement.
          </h1>
          <p className="mt-6 max-w-2xl text-base leading-8 text-orange-100/72 sm:text-lg">
            Monitor live QR biometric scans, verify IN/OUT movement, and keep ICC student access records protected behind staff, professor, and super admin credentials.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <a href="#login" className="inline-flex h-12 items-center gap-2 rounded-xl bg-orange-500 px-5 text-sm font-bold text-black shadow-[0_18px_40px_-20px_rgba(249,115,22,0.9)] transition hover:bg-orange-400">
              Login
              <ArrowRight className="size-4" />
            </a>
            <Button asChild variant="outline" className="h-12 border-orange-200/25 bg-orange-100/5 text-orange-50 hover:bg-orange-100/10 hover:text-white">
              <a href="/about">View System</a>
            </Button>
          </div>
          <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {[
              ["Realtime", "Live QR scan feed"],
              ["Secure", "Staff-only logger"],
              ["Student History", "IN/OUT records"],
              ["Admin Control", "Credential control"],
              ["Role", "Staff, professor, or admin"],
            ].map(([title, text]) => (
              <div key={title} className="rounded-2xl border border-orange-200/15 bg-white/[0.045] p-4 backdrop-blur">
                <p className="text-lg font-bold text-orange-100">{title}</p>
                <p className="mt-1 text-xs text-orange-100/60">{text}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="login" className="relative">
          <div className="absolute -left-8 -top-8 hidden size-24 rounded-3xl border border-orange-300/20 bg-orange-400/10 blur-sm lg:block" />
          <div className="relative overflow-hidden rounded-[2rem] border border-orange-300/25 bg-[#130c08]/88 p-5 shadow-[0_30px_90px_-36px_rgba(249,115,22,0.95)] backdrop-blur-xl sm:p-7">
            <div className="absolute right-6 top-6 flex size-16 items-center justify-center rounded-3xl border border-orange-300/20 bg-orange-400/10">
              <Image src="/logo.png" alt="QR LOGGER ICC logo" width={44} height={44} className="size-11 object-contain" priority />
            </div>
            <div className="mb-7 flex size-14 items-center justify-center rounded-2xl border border-orange-300/30 bg-orange-400/15 text-orange-100">
              <LockKeyhole className="size-6" />
            </div>
            <h2 className="text-2xl font-bold text-orange-50">Staff Login</h2>
            <p className="mt-2 max-w-sm text-sm leading-6 text-orange-100/65">Use an admin-created staff, professor, or super admin access account to open the live QRBiometric dashboard.</p>

            <form onSubmit={handleSubmit} className="mt-7 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="staff-username" className="text-orange-100/90">Username</Label>
                <Input id="staff-username" autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} placeholder="icc-staff" className="h-12 border-orange-300/25 bg-black/25 text-orange-50 placeholder:text-orange-100/35 focus-visible:border-orange-400 focus-visible:ring-orange-400/30" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="staff-password" className="text-orange-100/90">Password</Label>
                <div className="relative">
                  <Input id="staff-password" type={showPassword ? "text" : "password"} autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Enter your access password" className="h-12 border-orange-300/25 bg-black/25 pr-12 text-orange-50 placeholder:text-orange-100/35 focus-visible:border-orange-400 focus-visible:ring-orange-400/30" required />
                  <button
                    type="button"
                    onClick={() => setShowPassword((current) => !current)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    className="absolute right-3 top-1/2 inline-flex size-8 -translate-y-1/2 items-center justify-center rounded-lg text-orange-100/60 transition hover:bg-orange-100/10 hover:text-orange-100"
                  >
                    {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              </div>
              {error ? <p className="rounded-xl border border-red-400/25 bg-red-500/10 px-3 py-2 text-sm font-medium text-red-200">{error}</p> : null}
              <Button className="h-12 w-full bg-orange-500 text-base font-bold text-black hover:bg-orange-400" disabled={loading}>
                {loading ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}
                {loading ? "Checking access..." : "Login to Dashboard"}
              </Button>
            </form>

            <div className="mt-6 grid gap-3 rounded-2xl border border-orange-300/15 bg-orange-300/5 p-4 text-xs text-orange-100/70 sm:grid-cols-2">
              <span className="inline-flex items-center gap-2"><Fingerprint className="size-3.5 text-orange-300" />Staff/professor/admin access</span>
              <span className="inline-flex items-center gap-2"><QrCode className="size-3.5 text-orange-300" />Live logger protected</span>
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}
