"use client"

import { useCallback, useEffect, useState, type FormEvent } from "react"
import { CheckCircle2, Clock3, Database, Fingerprint, Loader2, QrCode, RefreshCw, ScanLine, Search, ShieldCheck, WifiOff } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { QrEntryStateBadge, QrStudentAvatar, QrStudentSummary, qrStudentDisplayName } from "@/components/qr-biometric/qr-student-scan-details"
import type { QrBiometricReading, QrEntryState } from "@/types/qr-biometric"

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
  manualLookup?: {
    enrollment: string
    found: boolean
    currentStatus: QrEntryState | null
    defaultEntryState: QrEntryState | null
    reading: QrBiometricReading | null
  } | null
}

interface QrManualPostResponse {
  success: boolean
  error?: string
  entryState?: QrEntryState
  previousEntryState?: QrEntryState
  received?: QrBiometricReading
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
  const [manualOpen, setManualOpen] = useState(false)
  const [manualEnrollment, setManualEnrollment] = useState("")
  const [manualLoading, setManualLoading] = useState(false)
  const [manualReading, setManualReading] = useState<QrBiometricReading | null>(null)
  const [manualPreview, setManualPreview] = useState<QrBiometricReading | null>(null)
  const [manualCurrentStatus, setManualCurrentStatus] = useState<QrEntryState | null>(null)
  const [manualEntryState, setManualEntryState] = useState<QrEntryState>("IN")

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
  const featuredReading = manualReading ?? latest
  const online = data.health.status === "online"
  const featuredTime = formatClock(featuredReading?.timestamp)
  const actualLatestTime = formatClock(latest?.timestamp)

  async function handleManualLookup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const enrollment = manualEnrollment.trim()
    if (!enrollment) {
      toast.error("Enter enrollment number")
      return
    }

    setManualLoading(true)
    try {
      const params = new URLSearchParams({ limit: "12", manualEnrollment: enrollment })
      const response = await fetch(`/api/qr-biometric-icc?${params.toString()}`, { cache: "no-store" })
      if (!response.ok) throw new Error("Manual lookup failed")

      const result = (await response.json()) as QrApiResponse
      setData(result)

      const matchedReading = result.manualLookup?.reading ?? null
      if (!matchedReading) {
        setManualPreview(null)
        setManualCurrentStatus(null)
        toast.error("No saved scan found for this enrollment", {
          description: "The student must scan QR at least once before manual lookup can work.",
        })
        return
      }

      const currentStatus = result.manualLookup?.currentStatus ?? matchedReading.entryState
      const defaultEntryState = result.manualLookup?.defaultEntryState ?? (currentStatus === "IN" ? "OUT" : "IN")
      setManualPreview(matchedReading)
      setManualCurrentStatus(currentStatus)
      setManualEntryState(defaultEntryState)
      toast.success("Student found", {
        description: `Current status is ${currentStatus}. Default manual mark is ${defaultEntryState}.`,
      })
    } catch (error) {
      toast.error("Could not fetch student record", {
        description: error instanceof Error ? error.message : "Please try again.",
      })
    } finally {
      setManualLoading(false)
    }
  }

  async function handleManualSubmit() {
    const enrollment = manualEnrollment.trim()
    if (!enrollment || !manualPreview) {
      toast.error("Fetch a saved student first")
      return
    }

    setManualLoading(true)
    try {
      const response = await fetch("/api/qr-biometric-icc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ manualEnrollment: enrollment, entryState: manualEntryState }),
      })
      const result = (await response.json().catch(() => null)) as QrManualPostResponse | null
      if (!response.ok || !result?.success || !result.received) throw new Error(result?.error ?? "Manual logging failed")

      setManualReading(result.received)
      setManualPreview(null)
      setManualCurrentStatus(result.entryState ?? manualEntryState)
      setManualOpen(false)
      setLoading(true)
      void fetchData()
      toast.success(`Manual ${result.entryState ?? manualEntryState} marked`, {
        description: `${qrStudentDisplayName(result.received)} has been added to the logs.`,
      })
    } catch (error) {
      toast.error("Could not mark manual log", {
        description: error instanceof Error ? error.message : "Please try again.",
      })
    } finally {
      setManualLoading(false)
    }
  }

  function openManualDialog() {
    setManualOpen(true)
    setManualPreview(null)
    setManualCurrentStatus(null)
  }

  return (
    <main className="mx-auto flex w-full max-w-[1440px] flex-1 flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8">
      <section className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground md:text-3xl">QRBiometric Student Entry/Exit Dashboard</h1>
          <p className="mt-2 text-sm text-muted-foreground md:text-base">Immediate WiFi QR scan events for student logging, decoded-data storage, and verification workflow analysis.</p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
          <Button onClick={() => { setLoading(true); setManualReading(null); void fetchData() }} disabled={loading} variant="outline" className="w-full gap-2 bg-card/80 sm:w-auto">
            <RefreshCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
            Refresh
          </Button>
          <Button onClick={openManualDialog} variant="outline" className="w-full gap-2 border-orange-500/40 bg-orange-500/10 text-orange-500 hover:bg-orange-500/20 hover:text-orange-400 sm:w-auto">
            <Fingerprint className="h-4 w-4" />
            Manual
          </Button>
        </div>
      </section>

      <Dialog open={manualOpen} onOpenChange={setManualOpen}>
        <DialogContent className="grid max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden border-orange-500/35 bg-card p-0 shadow-[0_24px_80px_-32px_rgba(249,115,22,0.8)] sm:max-h-[calc(100dvh-2rem)] sm:max-w-xl">
          <div className="relative border-b border-orange-500/20 bg-[radial-gradient(circle_at_top_left,rgba(249,115,22,0.28),transparent_42%),linear-gradient(135deg,rgba(24,13,6,0.96),rgba(8,8,10,0.96))] p-5 pr-12 text-orange-50 sm:p-6">
            <div className="mb-4 flex size-12 items-center justify-center rounded-2xl border border-orange-300/30 bg-orange-400/15 shadow-inner">
              <Fingerprint className="size-6 text-orange-200" />
            </div>
            <DialogHeader>
              <DialogTitle className="text-xl font-bold text-orange-50">Manual student entry</DialogTitle>
              <DialogDescription className="text-orange-100/72">
                Find the saved student, confirm their current status, then mark the manual IN/OUT log.
              </DialogDescription>
            </DialogHeader>
          </div>
          <form onSubmit={handleManualLookup} className="min-h-0 space-y-4 overflow-y-auto p-4 sm:p-6">
            <div className="rounded-2xl border border-border bg-background/70 p-4">
              <label htmlFor="manual-enrollment" className="text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">Enrollment number</label>
              <Input
                id="manual-enrollment"
                value={manualEnrollment}
                onChange={(event) => setManualEnrollment(event.target.value)}
                placeholder="Enter enrollment number"
                autoComplete="off"
                className="mt-3 h-11 rounded-xl border-orange-500/30 bg-card/80 px-4 font-mono text-base focus-visible:border-orange-500 focus-visible:ring-orange-500/25"
              />
              <p className="mt-3 text-xs leading-relaxed text-muted-foreground">Manual mode uses the saved QR profile from the database. The student must have scanned successfully at least once.</p>
            </div>
            {manualPreview ? (
              <div className="space-y-4 rounded-2xl border border-orange-500/25 bg-orange-500/5 p-4">
                <div className="flex items-center gap-3 sm:gap-4">
                  <QrStudentAvatar reading={manualPreview} size="lg" />
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="truncate text-base font-bold text-foreground sm:text-lg">{qrStudentDisplayName(manualPreview)}</p>
                    <p className="truncate text-xs text-muted-foreground sm:text-sm">Enrollment: <span className="font-mono text-foreground">{manualPreview.studentInfo?.enrollmentNo ?? manualEnrollment}</span></p>
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-border bg-background/70 p-3">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Current status</p>
                    <div className="mt-2">{manualCurrentStatus ? <QrEntryStateBadge state={manualCurrentStatus} /> : <span className="text-sm text-muted-foreground">Unknown</span>}</div>
                  </div>
                  <div className="rounded-xl border border-border bg-background/70 p-3">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Update status</p>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      {(["IN", "OUT"] as QrEntryState[]).map((state) => (
                        <Button
                          key={state}
                          type="button"
                          variant={manualEntryState === state ? "default" : "outline"}
                          onClick={() => setManualEntryState(state)}
                          className={manualEntryState === state ? "bg-orange-500 text-white hover:bg-orange-600" : "border-orange-500/30 bg-card/70 text-orange-500 hover:bg-orange-500/10"}
                        >
                          {manualEntryState === state && <CheckCircle2 className="h-4 w-4" />}
                          {state}
                        </Button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="grid gap-2 rounded-2xl border border-orange-500/20 bg-orange-500/5 p-4 text-xs text-muted-foreground sm:grid-cols-3">
                <span className="font-semibold text-foreground">1. Find student</span>
                <span className="font-semibold text-foreground">2. Choose IN/OUT</span>
                <span className="font-semibold text-foreground">3. Mark log</span>
              </div>
            )}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" onClick={() => setManualOpen(false)} disabled={manualLoading} className="w-full sm:w-auto">Cancel</Button>
              {manualPreview && <Button type="button" variant="outline" onClick={() => setManualPreview(null)} disabled={manualLoading} className="w-full sm:w-auto">Change enrollment</Button>}
              <Button type="submit" disabled={manualLoading} className="w-full gap-2 bg-orange-500 text-white hover:bg-orange-600 sm:w-auto">
                {manualLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                {manualPreview ? "Refresh student" : "Find student"}
              </Button>
              {manualPreview && (
                <Button type="button" onClick={handleManualSubmit} disabled={manualLoading} className="w-full gap-2 bg-emerald-600 text-white hover:bg-emerald-700 sm:w-auto">
                  {manualLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  Mark {manualEntryState}
                </Button>
              )}
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <section className="mobile-paint-stable grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="mobile-paint-stable min-w-0 rounded-2xl border border-orange-500/45 bg-orange-500/5 p-4">
          <p className="mb-1 text-xs uppercase tracking-wider text-muted-foreground">Latest Event</p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <QrCode className="h-5 w-5 shrink-0 text-orange-500" />
            <p className="min-w-0 text-lg font-bold text-orange-500">{featuredReading ? (manualReading ? "MANUAL" : "SCAN OK") : "-"}</p>
            {featuredReading && <QrEntryStateBadge state={featuredReading.entryState} />}
          </div>
          <p className="mt-1 line-clamp-1 break-all text-xs text-muted-foreground">{featuredReading ? qrStudentDisplayName(featuredReading) : "No scan yet"}</p>
        </div>
        <div className="mobile-paint-stable min-w-0 rounded-2xl border border-border bg-card/80 p-4">
          <p className="mb-1 text-xs uppercase tracking-wider text-muted-foreground">Total Logs</p>
          <p className="text-2xl font-bold tabular-nums">{data.stats.totalScans}</p>
          <p className="mt-1 text-xs text-muted-foreground">IN {data.stats.currentIn} · OUT {data.stats.currentOut}</p>
        </div>
        <div className="mobile-paint-stable min-w-0 rounded-2xl border border-border bg-card/80 p-4">
          <p className="mb-1 text-xs uppercase tracking-wider text-muted-foreground">Devices</p>
          <p className="text-2xl font-bold tabular-nums text-orange-500">{data.stats.uniqueDevices}</p>
          <p className="mt-1 text-xs text-muted-foreground">Student profiles: {data.stats.scrapedStudents}</p>
        </div>
        <div className="mobile-paint-stable min-w-0 rounded-2xl border border-border bg-card/80 p-4">
          <p className="mb-1 text-xs uppercase tracking-wider text-muted-foreground">Device Health</p>
          <div className="mt-1 flex items-center gap-2">
            {online ? <span className="flex items-center gap-1.5 text-sm font-bold text-emerald-500"><span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" /><span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" /></span>LIVE</span> : <span className="flex items-center gap-1.5 text-sm font-bold text-red-500"><WifiOff className="h-3.5 w-3.5" />OFFLINE</span>}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{relativeSeconds(data.health.lastSeenSeconds)}</p>
        </div>
      </section>

      <section className="mobile-paint-stable overflow-hidden rounded-3xl border border-orange-500/45 bg-[#120b07] p-5 shadow-[0_0_0_1px_rgba(251,146,60,0.18),0_24px_52px_-28px_rgba(249,115,22,0.72)]">
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
            {featuredReading ? (
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                <QrStudentAvatar reading={featuredReading} size="lg" />
                <div className="min-w-0 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="min-w-0 break-words text-2xl font-bold leading-tight text-orange-100">{qrStudentDisplayName(featuredReading)}</p>
                    <QrEntryStateBadge state={featuredReading.entryState} />
                    {manualReading && <span className="rounded-full border border-orange-300/30 bg-orange-300/10 px-2.5 py-1 text-xs font-bold text-orange-100">Manual lookup</span>}
                  </div>
                  <p className="break-words text-sm text-orange-100/75">Enrollment: <span className="font-mono text-orange-100">{featuredReading.studentInfo?.enrollmentNo ?? "--"}</span></p>
                  {featuredReading.studentInfo?.bhawan && <p className="text-sm text-orange-100/75">Bhawan: <span className="font-semibold text-orange-100">{featuredReading.studentInfo.bhawan}</span></p>}
                  {featuredReading.studentInfo?.year && <p className="text-sm text-orange-100/75">Year: <span className="font-semibold text-orange-100">{featuredReading.studentInfo.year}</span></p>}
                  {featuredReading.studentInfo?.emailId && <p className="break-all text-sm text-orange-100/75">Email: <span className="font-mono text-orange-100">{featuredReading.studentInfo.emailId}</span></p>}
                  <p className="font-mono text-xs text-orange-100/65">{featuredReading.entryState} time: {featuredTime}</p>
                  {manualReading && <Button onClick={() => setManualReading(null)} size="sm" variant="outline" className="mt-1 border-orange-300/30 bg-orange-300/10 text-orange-100 hover:bg-orange-300/20 hover:text-white">Show live latest</Button>}
                </div>
              </div>
            ) : (
              <p className="font-mono text-xl font-semibold leading-snug text-orange-100">No QR data yet</p>
            )}
            <p className="mt-4 break-all text-xs text-orange-100/70">Device: <span className="font-mono text-orange-100">{featuredReading?.deviceId ?? "--"}</span></p>
          </div>

          <div className="grid gap-3">
            <div className="min-w-0 rounded-xl border border-orange-300/20 bg-[#1b120b] p-4">
              <p className="text-[11px] uppercase tracking-[0.18em] text-orange-100/70">Total Scans</p>
              <p className="mt-2 inline-flex items-center gap-2 font-mono text-xl text-orange-100"><Database className="h-4 w-4" />{data.stats.totalScans}</p>
            </div>
            <div className="min-w-0 rounded-xl border border-orange-300/20 bg-[#1b120b] p-4">
              <p className="text-[11px] uppercase tracking-[0.18em] text-orange-100/70">Unique QR Codes</p>
              <p className="mt-2 inline-flex items-center gap-2 font-mono text-xl text-orange-100"><QrCode className="h-4 w-4" />{data.stats.uniqueCodes}</p>
            </div>
            <div className="min-w-0 rounded-xl border border-orange-300/20 bg-[#1b120b] p-4">
              <p className="text-[11px] uppercase tracking-[0.18em] text-orange-100/70">Verification Stage</p>
              <p className="mt-2 inline-flex min-w-0 items-center gap-2 font-mono text-sm text-orange-100/90"><ShieldCheck className="h-4 w-4 shrink-0" />Decode stored</p>
            </div>
            <div className="min-w-0 rounded-xl border border-orange-300/20 bg-[#1b120b] p-4">
              <p className="text-[11px] uppercase tracking-[0.18em] text-orange-100/70">Last Update</p>
              <p className="mt-2 inline-flex min-w-0 items-center gap-2 font-mono text-base text-orange-100/90"><Clock3 className="h-4 w-4 shrink-0" />{manualReading ? featuredTime : actualLatestTime}</p>
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
                    <td className="px-4 py-3"><QrEntryStateBadge state={reading.entryState} /></td>
                    <td className="px-4 py-3 font-mono text-xs">{reading.deviceId}</td>
                    <td className="max-w-[520px] px-4 py-3">
                      <QrStudentSummary reading={reading} />
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
