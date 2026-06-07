"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Activity, Database, Download, QrCode, RefreshCw, Search, ShieldCheck, Users, Wifi, WifiOff } from "lucide-react"
import type { LucideIcon } from "lucide-react"

import { Button } from "@/components/ui/button"

type EntryState = "IN" | "OUT"

interface QrReading {
  id: string
  deviceId: string
  decodedData: string
  decodedUrl: string | null
  scanStatus: string
  entryState: EntryState
  characterCount: number
  studentInfo: {
    fullName?: string
    enrollmentNo?: string
    emailId?: string
    bhawan?: string
    year?: string
    photoUrl?: string
  } | null
  studentInfoStatus: string
  timestamp: string
}

interface QrApiResponse {
  latest: QrReading | null
  readings: QrReading[]
  stats: {
    totalScans: number
    uniqueCodes: number
    uniqueDevices: number
    currentIn: number
    currentOut: number
    scrapedStudents: number
    dailyScans?: number
    monthlyScans?: number
  }
  health: {
    status: "online" | "offline"
    lastSeenSeconds: number | null
  }
}

const emptyData: QrApiResponse = {
  latest: null,
  readings: [],
  stats: {
    totalScans: 0,
    uniqueCodes: 0,
    uniqueDevices: 0,
    currentIn: 0,
    currentOut: 0,
    scrapedStudents: 0,
    dailyScans: 0,
    monthlyScans: 0,
  },
  health: {
    status: "offline",
    lastSeenSeconds: null,
  },
}

function formatTime(value: string | null | undefined) {
  if (!value) return "--:--"
  return new Date(value).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
}

function relativeSeconds(seconds: number | null) {
  if (seconds === null) return "No signal yet"
  if (seconds < 60) return `${seconds}s ago`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  return `${Math.floor(seconds / 3600)}h ago`
}

function studentName(reading: QrReading | null) {
  if (!reading) return "Waiting for first scan"
  return reading.studentInfo?.fullName ?? reading.studentInfo?.enrollmentNo ?? "Student QR captured"
}

type StatCardConfig = [LucideIcon, string, number, string]

export function QrBiometricDashboard() {
  const [data, setData] = useState<QrApiResponse>(emptyData)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")

  const fetchData = useCallback(async () => {
    try {
      const params = new URLSearchParams({ limit: "12" })
      if (search.trim()) params.set("search", search.trim())
      const response = await fetch(`/api/qr-biometric?${params.toString()}`, { cache: "no-store" })
      if (!response.ok) return
      const result = (await response.json()) as QrApiResponse
      setData(result)
    } finally {
      setLoading(false)
    }
  }, [search])

  useEffect(() => {
    void fetchData()
    const interval = window.setInterval(() => void fetchData(), 10000)
    return () => window.clearInterval(interval)
  }, [fetchData])

  const latest = data.latest
  const online = data.health.status === "online"
  const latestInitials = useMemo(() => studentName(latest).slice(0, 2).toUpperCase(), [latest])

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-3xl border border-orange-500/25 bg-card/70 p-6 shadow-2xl shadow-orange-950/30 backdrop-blur md:p-8">
          <div className="inline-flex items-center gap-2 rounded-full border border-orange-500/30 bg-orange-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-orange-300">
            <QrCode className="h-3.5 w-3.5" />
            Live ICC Logger
          </div>
          <h1 className="mt-6 max-w-3xl text-4xl font-semibold tracking-tight text-foreground sm:text-5xl lg:text-6xl">
            QRBiometric Student Entry/Exit Dashboard
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-muted-foreground">
            Dedicated real-time QR biometric logging interface for ICC, IIT Roorkee with device health, scan status, daily activity, and admin-ready log visibility.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button onClick={() => { setLoading(true); void fetchData() }} disabled={loading} className="bg-orange-500 text-black hover:bg-orange-400">
              <RefreshCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
              Refresh feed
            </Button>
            <Button asChild variant="outline">
              <a href="/api/qr-biometric/export">
                <Download className="h-4 w-4" />
                Export CSV
              </a>
            </Button>
          </div>
        </div>

        <div className="overflow-hidden rounded-3xl border border-orange-500/40 bg-[#120b07] p-5 shadow-[0_0_0_1px_rgba(251,146,60,0.18),0_24px_52px_-28px_rgba(249,115,22,0.72)]">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.28em] text-orange-100/85">QRBiometric OLED Feed</p>
              <p className="mt-1 text-xs text-orange-100/60">Latest verified scan event</p>
            </div>
            <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${online ? "border-emerald-300/40 bg-emerald-300/10 text-emerald-200" : "border-red-300/40 bg-red-300/10 text-red-200"}`}>
              {online ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
              {online ? "ONLINE" : "OFFLINE"}
            </span>
          </div>
          <div className="rounded-2xl border border-orange-400/25 bg-orange-400/5 p-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-2xl border border-orange-300/25 bg-[#1b120b] text-xl font-bold text-orange-100">
                {latestInitials}
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-2xl font-bold leading-tight text-orange-100">{studentName(latest)}</h2>
                  {latest && <span className={`rounded-full border px-2.5 py-1 text-xs font-black ${latest.entryState === "IN" ? "border-emerald-300/45 bg-emerald-300/10 text-emerald-200" : "border-red-300/45 bg-red-300/10 text-red-200"}`}>{latest.entryState}</span>}
                </div>
                <p className="mt-2 text-sm text-orange-100/70">Enrollment: <span className="font-mono text-orange-100">{latest?.studentInfo?.enrollmentNo ?? "--"}</span></p>
                <p className="mt-1 text-sm text-orange-100/70">Device: <span className="font-mono text-orange-100">{latest?.deviceId ?? "--"}</span></p>
                <p className="mt-1 font-mono text-xs text-orange-100/60">{formatTime(latest?.timestamp)}</p>
              </div>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            {[
              ["Total", data.stats.totalScans],
              ["Today", data.stats.dailyScans ?? 0],
              ["Inside", data.stats.currentIn],
              ["Month", data.stats.monthlyScans ?? 0],
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-xl border border-orange-300/20 bg-[#1b120b] p-3">
                <p className="text-[11px] uppercase tracking-[0.2em] text-orange-100/60">{String(label)}</p>
                <p className="mt-1 font-mono text-2xl text-orange-100">{Number(value)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {([
          [Activity, "Daily Logs", data.stats.dailyScans ?? 0, "Scans captured today"],
          [Database, "Monthly Logs", data.stats.monthlyScans ?? 0, "Current month total"],
          [Users, "Students Inside", data.stats.currentIn, "Latest IN state count"],
          [ShieldCheck, "Profiles", data.stats.scrapedStudents, "Readable student profiles"],
        ] satisfies StatCardConfig[]).map(([Icon, label, value, text]) => (
          <div key={String(label)} className="rounded-2xl border border-border bg-card/75 p-5">
            <Icon className="h-5 w-5 text-orange-300" />
            <p className="mt-4 text-xs uppercase tracking-[0.18em] text-muted-foreground">{String(label)}</p>
            <p className="mt-2 font-mono text-3xl font-semibold">{Number(value)}</p>
            <p className="mt-1 text-xs text-muted-foreground">{String(text)}</p>
          </div>
        ))}
      </section>

      <section className="rounded-3xl border border-border bg-card/75">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
          <div>
            <h2 className="text-lg font-semibold">Recent QR Logs</h2>
            <p className="text-xs text-muted-foreground">Last update {relativeSeconds(data.health.lastSeenSeconds)}</p>
          </div>
          <div className="relative w-full sm:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { setLoading(true); void fetchData() } }} placeholder="Search logs" className="w-full rounded-xl border border-border bg-background/70 py-2 pl-9 pr-3 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20" />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30 text-xs uppercase tracking-[0.14em] text-muted-foreground">
                <th className="px-4 py-3 text-left font-medium">State</th>
                <th className="px-4 py-3 text-left font-medium">Device</th>
                <th className="px-4 py-3 text-left font-medium">Student / QR</th>
                <th className="px-4 py-3 text-left font-medium">Time</th>
              </tr>
            </thead>
            <tbody>
              {data.readings.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-muted-foreground">No QR scans found yet.</td>
                </tr>
              ) : (
                data.readings.map((reading) => (
                  <tr key={reading.id} className="border-b border-border/60 hover:bg-muted/20">
                    <td className="px-4 py-3"><span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${reading.entryState === "IN" ? "border-emerald-500/35 bg-emerald-500/10 text-emerald-300" : "border-red-500/35 bg-red-500/10 text-red-300"}`}>{reading.entryState}</span></td>
                    <td className="px-4 py-3 font-mono text-xs">{reading.deviceId}</td>
                    <td className="max-w-[520px] px-4 py-3">
                      <p className="font-medium">{studentName(reading)}</p>
                      <p className="mt-1 line-clamp-1 break-all font-mono text-xs text-muted-foreground">{reading.decodedUrl ?? reading.decodedData}</p>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{formatTime(reading.timestamp)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  )
}
