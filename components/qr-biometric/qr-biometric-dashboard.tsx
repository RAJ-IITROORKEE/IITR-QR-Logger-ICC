"use client"

import { useCallback, useEffect, useState } from "react"
import { Clock3, Database, QrCode, RefreshCw, ScanLine, Search, ShieldCheck, WifiOff } from "lucide-react"

import { Button } from "@/components/ui/button"
import { QrDecodedPayloadLink, QrEntryStateBadge, QrScanDetailsDialog, QrStudentAvatar, QrStudentSummary, qrStudentDisplayName } from "@/components/qr-biometric/qr-student-scan-details"
import type { QrBiometricReading } from "@/types/qr-biometric"

interface QrApiResponse {
  latest: QrBiometricReading | null
  readings: QrBiometricReading[]
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

function formatClock(value: string | null | undefined) {
  if (!value) return "--:--:--"
  return new Date(value).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
}

export function QrBiometricDashboard() {
  const [data, setData] = useState<QrApiResponse>(emptyData)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")

  const fetchData = useCallback(async () => {
    try {
      const params = new URLSearchParams({ limit: "12" })
      if (search.trim()) params.set("search", search.trim())
      const response = await fetch(`/api/qr-biometric-icc?${params.toString()}`, { cache: "no-store" })
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
  const latestTime = formatClock(latest?.timestamp)

  return (
    <main className="mx-auto flex w-full max-w-[1440px] flex-1 flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8">
      <section className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground md:text-3xl">QRBiometric Student Entry/Exit Dashboard</h1>
          <p className="mt-2 text-sm text-muted-foreground md:text-base">Immediate WiFi QR scan events for student logging, decoded-data storage, and verification workflow analysis.</p>
        </div>
        <Button onClick={() => { setLoading(true); void fetchData() }} disabled={loading} variant="outline" className="gap-2 bg-card/80">
          <RefreshCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
          Refresh
        </Button>
      </section>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="rounded-2xl border border-orange-500/45 bg-orange-500/5 p-4">
          <p className="mb-1 text-xs uppercase tracking-wider text-muted-foreground">Latest Event</p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <QrCode className="h-5 w-5 text-orange-500" />
            <p className="text-lg font-bold text-orange-500">{latest ? "SCAN OK" : "-"}</p>
            {latest && <QrEntryStateBadge state={latest.entryState} />}
          </div>
          <p className="mt-1 line-clamp-1 break-all text-xs text-muted-foreground">{latest ? qrStudentDisplayName(latest) : "No scan yet"}</p>
        </div>
        <div className="rounded-2xl border border-border bg-card/80 p-4">
          <p className="mb-1 text-xs uppercase tracking-wider text-muted-foreground">Total Logs</p>
          <p className="text-2xl font-bold tabular-nums">{data.stats.totalScans}</p>
          <p className="mt-1 text-xs text-muted-foreground">IN {data.stats.currentIn} · OUT {data.stats.currentOut}</p>
        </div>
        <div className="rounded-2xl border border-border bg-card/80 p-4">
          <p className="mb-1 text-xs uppercase tracking-wider text-muted-foreground">Devices</p>
          <p className="text-2xl font-bold tabular-nums text-orange-500">{data.stats.uniqueDevices}</p>
          <p className="mt-1 text-xs text-muted-foreground">Student profiles: {data.stats.scrapedStudents}</p>
        </div>
        <div className="rounded-2xl border border-border bg-card/80 p-4">
          <p className="mb-1 text-xs uppercase tracking-wider text-muted-foreground">Device Health</p>
          <div className="mt-1 flex items-center gap-2">
            {online ? <span className="flex items-center gap-1.5 text-sm font-bold text-emerald-500"><span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" /><span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" /></span>LIVE</span> : <span className="flex items-center gap-1.5 text-sm font-bold text-red-500"><WifiOff className="h-3.5 w-3.5" />OFFLINE</span>}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{relativeSeconds(data.health.lastSeenSeconds)}</p>
        </div>
      </section>

      <section className="overflow-hidden rounded-3xl border border-orange-500/45 bg-[#120b07] p-5 shadow-[0_0_0_1px_rgba(251,146,60,0.18),0_24px_52px_-28px_rgba(249,115,22,0.72)]">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-orange-100/90">QRBiometric Live Feed</p>
            <p className="mt-1 text-xs text-orange-100/65">Student QR scan event feed</p>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.35fr_1fr]">
          <div className="rounded-2xl border border-orange-400/30 bg-orange-400/5 p-5">
            <div className="mb-4 flex items-center gap-2 text-orange-200/90">
              <ScanLine className="h-4 w-4" />
              <span className="text-xs uppercase tracking-[0.22em]">Latest Scan</span>
            </div>
            {latest ? (
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                <QrStudentAvatar reading={latest} size="lg" />
                <div className="min-w-0 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-2xl font-bold leading-tight text-orange-100">{qrStudentDisplayName(latest)}</p>
                    <QrEntryStateBadge state={latest.entryState} />
                  </div>
                  <p className="text-sm text-orange-100/75">Enrollment: <span className="font-mono text-orange-100">{latest.studentInfo?.enrollmentNo ?? "--"}</span></p>
                  {latest.studentInfo?.bhawan && <p className="text-sm text-orange-100/75">Bhawan: <span className="font-semibold text-orange-100">{latest.studentInfo.bhawan}</span></p>}
                  {latest.studentInfo?.year && <p className="text-sm text-orange-100/75">Year: <span className="font-semibold text-orange-100">{latest.studentInfo.year}</span></p>}
                  {latest.studentInfo?.emailId && <p className="text-sm text-orange-100/75">Email: <span className="font-mono text-orange-100">{latest.studentInfo.emailId}</span></p>}
                  <p className="font-mono text-xs text-orange-100/65">{latest.entryState} time: {latestTime}</p>
                  <QrDecodedPayloadLink reading={latest} className="text-orange-100/70 hover:text-orange-100" />
                </div>
              </div>
            ) : (
              <p className="font-mono text-xl font-semibold leading-snug text-orange-100">No QR data yet</p>
            )}
            <p className="mt-4 text-xs text-orange-100/70">Device: <span className="font-mono text-orange-100">{latest?.deviceId ?? "--"}</span></p>
          </div>

          <div className="grid gap-3">
            <div className="rounded-xl border border-orange-300/20 bg-[#1b120b] p-4">
              <p className="text-[11px] uppercase tracking-[0.18em] text-orange-100/70">Total Scans</p>
              <p className="mt-2 inline-flex items-center gap-2 font-mono text-xl text-orange-100"><Database className="h-4 w-4" />{data.stats.totalScans}</p>
            </div>
            <div className="rounded-xl border border-orange-300/20 bg-[#1b120b] p-4">
              <p className="text-[11px] uppercase tracking-[0.18em] text-orange-100/70">Unique QR Codes</p>
              <p className="mt-2 inline-flex items-center gap-2 font-mono text-xl text-orange-100"><QrCode className="h-4 w-4" />{data.stats.uniqueCodes}</p>
            </div>
            <div className="rounded-xl border border-orange-300/20 bg-[#1b120b] p-4">
              <p className="text-[11px] uppercase tracking-[0.18em] text-orange-100/70">Verification Stage</p>
              <p className="mt-2 inline-flex items-center gap-2 font-mono text-sm text-orange-100/90"><ShieldCheck className="h-4 w-4" />Decode stored</p>
            </div>
            <div className="rounded-xl border border-orange-300/20 bg-[#1b120b] p-4">
              <p className="text-[11px] uppercase tracking-[0.18em] text-orange-100/70">Last Update</p>
              <p className="mt-2 inline-flex items-center gap-2 font-mono text-base text-orange-100/90"><Clock3 className="h-4 w-4" />{latestTime}</p>
              <p className="mt-1 text-xs text-orange-100/60">{relativeSeconds(data.health.lastSeenSeconds)}</p>
            </div>
          </div>
        </div>
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
                <th className="px-4 py-3 text-right font-medium">View</th>
              </tr>
            </thead>
            <tbody>
              {data.readings.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">No QR scans found yet.</td>
                </tr>
              ) : (
                data.readings.map((reading) => (
                  <tr key={reading.id} className="border-b border-border/60 hover:bg-muted/20">
                    <td className="px-4 py-3"><QrEntryStateBadge state={reading.entryState} /></td>
                    <td className="px-4 py-3 font-mono text-xs">{reading.deviceId}</td>
                    <td className="max-w-[520px] px-4 py-3">
                      <QrStudentSummary reading={reading} />
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{formatTime(reading.timestamp)}</td>
                    <td className="px-4 py-3 text-right"><QrScanDetailsDialog reading={reading} /></td>
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
