"use client"

import { useCallback, useEffect, useEffectEvent, useRef, useState, type FormEvent } from "react"
import { CheckCircle2, Clock3, Database, Fingerprint, Loader2, QrCode, RefreshCw, ScanLine, Search, ShieldCheck } from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { QrEntryStateBadge, QrStudentAvatar, QrStudentSummary, qrStudentDisplayName } from "@/components/qr-biometric/qr-student-scan-details"
import { useQrRealtimeUpdates } from "@/hooks/use-qr-realtime-updates"
import type { QrBiometricReading, QrEntryState } from "@/types/qr-biometric"

interface QrApiResponse {
  success?: boolean
  error?: string
  warning?: string | null
  latest: QrBiometricReading | null
  readings: QrBiometricReading[]
  stats: {
    totalScans: number
    uniqueCodes: number
    uniqueDevices: number
    currentIn: number
    currentOut: number
    scrapedStudents: number
    dailyIn: number
    dailyOut: number
    qrDeviceScans: number
    manualScans: number
    dailyScans?: number
    monthlyScans?: number
  }
  health: {
    status: "online" | "offline"
    lastSeenSeconds: number | null
  }
  pagination: {
    page: number
    totalPages: number
    total: number
    hasNextPage: boolean
    hasPrevPage: boolean
  }
  manualLookup?: {
    enrollment: string
    found: boolean
    currentStatus: QrEntryState | null
    defaultEntryState: QrEntryState | null
    reading: QrBiometricReading | null
  } | null
  changeSequence?: string
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
    dailyIn: 0,
    dailyOut: 0,
    qrDeviceScans: 0,
    manualScans: 0,
    dailyScans: 0,
    monthlyScans: 0,
  },
  health: {
    status: "offline",
    lastSeenSeconds: null,
  },
  pagination: {
    page: 1,
    totalPages: 1,
    total: 0,
    hasNextPage: false,
    hasPrevPage: false,
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
  const [hasLoadedData, setHasLoadedData] = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(1)
  const [manualOpen, setManualOpen] = useState(false)
  const [manualEnrollment, setManualEnrollment] = useState("")
  const [manualLoading, setManualLoading] = useState(false)
  const [manualReading, setManualReading] = useState<QrBiometricReading | null>(null)
  const [manualPreview, setManualPreview] = useState<QrBiometricReading | null>(null)
  const [manualCurrentStatus, setManualCurrentStatus] = useState<QrEntryState | null>(null)
  const [manualEntryState, setManualEntryState] = useState<QrEntryState>("IN")
  const fetchControllerRef = useRef<AbortController | null>(null)
  const fetchPromiseRef = useRef<Promise<void> | null>(null)
  const fetchKeyRef = useRef<string | null>(null)
  const changeSequenceRef = useRef<string | null>(null)

  const fetchData = useCallback(() => {
    const requestKey = `${page}\0${search.trim()}`
    if (fetchPromiseRef.current !== null && fetchKeyRef.current === requestKey) {
      return fetchPromiseRef.current
    }
    fetchControllerRef.current?.abort()
    const controller = new AbortController()
    fetchControllerRef.current = controller

    const request = (async () => {
      try {
      const params = new URLSearchParams({ limit: "12", page: String(page) })
      if (search.trim()) params.set("search", search.trim())
      const response = await fetch(`/api/qr-biometric-icc?${params.toString()}`, { cache: "no-store", signal: controller.signal })
      const result = (await response.json().catch(() => null)) as QrApiResponse | null
      if (!response.ok || !result) throw new Error(result?.error ?? `Dashboard request failed (${response.status})`)
      if (controller.signal.aborted) return
      setData(result)
      if (result.changeSequence) changeSequenceRef.current = result.changeSequence
      setHasLoadedData(true)
      setFetchError(result.warning ?? null)
      } catch (error) {
      if (controller.signal.aborted) return
      setFetchError(error instanceof Error ? error.message : "Dashboard data is temporarily unavailable")
      } finally {
      if (fetchControllerRef.current === controller) setLoading(false)
      }
    })()
    fetchPromiseRef.current = request
    fetchKeyRef.current = requestKey
    void request.finally(() => {
      if (fetchPromiseRef.current === request) {
        fetchPromiseRef.current = null
        fetchKeyRef.current = null
      }
    })
    return request
  }, [page, search])

  const refreshForChange = useEffectEvent(async () => {
    await fetchData()
  })
  useQrRealtimeUpdates(fetchData)

  useEffect(() => {
    const initial = window.setTimeout(() => void fetchData(), 0)
    return () => {
      window.clearTimeout(initial)
      fetchControllerRef.current?.abort()
    }
  }, [fetchData])

  useEffect(() => {
    const controller = new AbortController()
    let timer = 0
    let failureRetryMs = 1500
    const poll = async () => {
      let retryAfterMs = 1500
      try {
        if (document.visibilityState !== "visible") {
          retryAfterMs = 5000
          return
        }
        const response = await fetch("/api/qr-biometric-icc/changes", { cache: "no-store", signal: controller.signal })
        const result = (await response.json().catch(() => null)) as { success?: boolean; sequence?: string; retryAfterMs?: number } | null
        if (!response.ok || !result?.success || !result.sequence) throw new Error("Change feed unavailable")
        failureRetryMs = 1500
        retryAfterMs = result.retryAfterMs ?? retryAfterMs
        if (changeSequenceRef.current === null) changeSequenceRef.current = result.sequence
        else if (changeSequenceRef.current !== result.sequence) {
          await refreshForChange()
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          retryAfterMs = failureRetryMs
          failureRetryMs = Math.min(failureRetryMs * 2, 30000)
          if (error instanceof Error && error.name !== "AbortError") {
            console.warn("QR dashboard change polling failed", error)
          }
        }
      } finally {
        if (!controller.signal.aborted) timer = window.setTimeout(() => void poll(), retryAfterMs)
      }
    }
    timer = window.setTimeout(() => void poll(), 1500)
    return () => {
      controller.abort()
      window.clearTimeout(timer)
    }
  }, [])

  useEffect(() => {
    const fallback = window.setInterval(() => {
      if (document.visibilityState === "visible") void fetchData()
    }, 30000)
    return () => window.clearInterval(fallback)
  }, [fetchData])

  const latest = data.latest
  const featuredReading = latest
  const online = data.health.status === "online"
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
      // A lookup response is a manual-form snapshot, not a live-feed transition.
      setData((current) => ({ ...result, latest: current.latest }))
      setHasLoadedData(true)
      setFetchError(result.warning ?? null)

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
    <main className="mx-auto flex w-full max-w-[1320px] flex-1 flex-col gap-5 px-4 py-6 sm:px-6 lg:px-8">
      <section className="animate-rise flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="type-h1-app text-foreground">QRBiometric Student Entry/Exit Dashboard</h1>
          <p className="type-lede mt-2 text-muted-foreground">Immediate WiFi QR scan events for student logging, decoded-data storage, and verification workflow analysis.</p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
          <Button onClick={() => { setLoading(true); setManualReading(null); void fetchData() }} disabled={loading} variant="outline" className="w-full gap-2 sm:w-auto">
            <RefreshCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
            Refresh
          </Button>
          <Button onClick={openManualDialog} variant="outline" className="w-full gap-2 sm:w-auto">
            <Fingerprint className="h-4 w-4 text-brand" />
            Manual
          </Button>
        </div>
      </section>

      {fetchError ? (
        <p role="alert" className="rounded-lg border border-offline-border bg-offline-surface px-4 py-3 text-sm text-offline">
          Dashboard data unavailable: {fetchError}{hasLoadedData ? " Showing the last successful update." : " Statistics are not available yet."}
        </p>
      ) : null}

      <Dialog open={manualOpen} onOpenChange={setManualOpen}>
        <DialogContent className="grid max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden bg-card p-0 sm:max-h-[calc(100dvh-2rem)] sm:max-w-xl">
          <div className="border-b border-border p-5 pr-12 sm:p-6">
            <div className="mb-4 flex size-[42px] items-center justify-center rounded-md border border-border bg-muted">
              <Fingerprint className="size-5 text-brand" />
            </div>
            <DialogHeader>
              <DialogTitle className="text-xl font-semibold text-foreground">Manual student entry</DialogTitle>
              <DialogDescription>
                Find the saved student, confirm their current status, then mark the manual IN/OUT log.
              </DialogDescription>
            </DialogHeader>
          </div>
          <form onSubmit={handleManualLookup} className="min-h-0 space-y-4 overflow-y-auto p-4 sm:p-6">
            <div className="tile p-4">
              <label htmlFor="manual-enrollment" className="text-[0.78rem] font-semibold text-muted-foreground">Enrollment number</label>
              <Input
                id="manual-enrollment"
                value={manualEnrollment}
                onChange={(event) => setManualEnrollment(event.target.value)}
                placeholder="Enter enrollment number"
                autoComplete="off"
                className="mt-3 font-mono"
              />
              <p className="mt-3 text-xs leading-relaxed text-muted-foreground">Manual mode uses the saved QR profile from the database. The student must have scanned successfully at least once.</p>
            </div>
            {manualPreview ? (
              <div className="tile space-y-4 p-4">
                <div className="flex items-center gap-3 sm:gap-4">
                  <QrStudentAvatar reading={manualPreview} size="lg" />
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="truncate text-base font-semibold text-foreground sm:text-lg">{qrStudentDisplayName(manualPreview)}</p>
                    <p className="truncate text-xs text-muted-foreground sm:text-sm">Enrollment: <span className="font-mono text-foreground">{manualPreview.studentInfo?.enrollmentNo ?? manualEnrollment}</span></p>
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-lg border border-border bg-card p-3">
                    <p className="text-[0.78rem] text-muted-foreground">Current status</p>
                    <div className="mt-2">{manualCurrentStatus ? <QrEntryStateBadge state={manualCurrentStatus} /> : <span className="text-sm text-muted-foreground">Unknown</span>}</div>
                  </div>
                  <div className="rounded-lg border border-border bg-card p-3">
                    <p className="text-[0.78rem] text-muted-foreground">Update status</p>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      {(["IN", "OUT"] as QrEntryState[]).map((state) => (
                        <Button
                          key={state}
                          type="button"
                          variant={manualEntryState === state ? "default" : "outline"}
                          onClick={() => setManualEntryState(state)}
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
              <ol className="tile grid gap-2 p-4 text-xs text-muted-foreground sm:grid-cols-3">
                <li className="font-semibold text-foreground">1. Find student</li>
                <li className="font-semibold text-foreground">2. Choose IN/OUT</li>
                <li className="font-semibold text-foreground">3. Mark log</li>
              </ol>
            )}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" onClick={() => setManualOpen(false)} disabled={manualLoading} className="w-full sm:w-auto">Cancel</Button>
              {manualPreview && <Button type="button" variant="outline" onClick={() => setManualPreview(null)} disabled={manualLoading} className="w-full sm:w-auto">Change enrollment</Button>}
              <Button type="submit" disabled={manualLoading} className="w-full gap-2 sm:w-auto">
                {manualLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                {manualPreview ? "Refresh student" : "Find student"}
              </Button>
              {manualPreview && (
                <Button type="button" onClick={handleManualSubmit} disabled={manualLoading} variant="outline" className="w-full gap-2 border-active-border bg-active-surface text-active hover:bg-active-surface/80 sm:w-auto">
                  {manualLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  Mark {manualEntryState}
                </Button>
              )}
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <section className="mobile-paint-stable animate-rise delay-65 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="panel mobile-paint-stable min-w-0 p-4">
          <p className="text-[0.78rem] text-muted-foreground">Latest Event</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <QrCode className="h-5 w-5 shrink-0 text-brand" />
            <p className="telemetry-value min-w-0 text-2xl">{featuredReading ? "SCAN OK" : "-"}</p>
            {featuredReading && <QrEntryStateBadge state={featuredReading.entryState} />}
          </div>
          <p className="mt-2 line-clamp-1 break-all text-xs text-muted-foreground">{featuredReading ? qrStudentDisplayName(featuredReading) : "No scan yet"}</p>
        </div>
        <div className="panel mobile-paint-stable min-w-0 p-4">
          <p className="text-[0.78rem] text-muted-foreground">Today&apos;s Logs</p>
          <p className="telemetry-value mt-2 text-2xl tabular-nums">{hasLoadedData ? (data.stats.dailyScans ?? 0) : "--"}</p>
          <p className="mt-2 font-mono text-xs text-muted-foreground">{hasLoadedData ? `IN ${data.stats.dailyIn} · OUT ${data.stats.dailyOut}` : "Statistics unavailable"}</p>
        </div>
        <div className="panel mobile-paint-stable min-w-0 p-4">
          <p className="text-[0.78rem] text-muted-foreground">Total Logs</p>
          <p className="telemetry-value mt-2 text-2xl tabular-nums text-brand">{hasLoadedData ? data.stats.totalScans : "--"}</p>
          <div className="mt-3" aria-label={`QR device scans: ${data.stats.qrDeviceScans}; manual scans: ${data.stats.manualScans}`}>
            <div className="flex h-2 overflow-hidden rounded-sm bg-muted" role="img" aria-label="QR device and manual scan distribution">
              <div
                title={`QR device scans: ${data.stats.qrDeviceScans}`}
                className="h-full bg-brand transition-all duration-500"
                style={{ width: `${data.stats.totalScans ? (data.stats.qrDeviceScans / data.stats.totalScans) * 100 : 0}%` }}
              />
              <div
                title={`Manual scans: ${data.stats.manualScans}`}
                className="h-full bg-muted-foreground/40 transition-all duration-500"
                style={{ width: `${data.stats.totalScans ? (data.stats.manualScans / data.stats.totalScans) * 100 : 0}%` }}
              />
            </div>
            <div className="mt-2 flex justify-between gap-2 text-[0.72rem] text-muted-foreground">
              <span title={`QR device scans: ${data.stats.qrDeviceScans}`}><span className="mr-1 inline-block size-1.5 rounded-full bg-brand" />QR device <span className="font-mono">{data.stats.qrDeviceScans}</span></span>
              <span title={`Manual scans: ${data.stats.manualScans}`}><span className="mr-1 inline-block size-1.5 rounded-full bg-muted-foreground/40" />Manual <span className="font-mono">{data.stats.manualScans}</span></span>
            </div>
          </div>
        </div>
        <div className="panel mobile-paint-stable min-w-0 p-4">
          <p className="text-[0.78rem] text-muted-foreground">Device Health</p>
          <div className="mt-2 flex items-center gap-2">
            {online ? (
              <Badge variant="active" className="gap-1.5">
                <span className="pulse-ring relative inline-flex size-[7px] shrink-0 rounded-full bg-current" aria-hidden="true" />
                LIVE
              </Badge>
            ) : (
              <Badge variant="offline" className="gap-1.5">
                <span className="inline-flex size-[7px] shrink-0 rounded-full bg-current" aria-hidden="true" />
                OFFLINE
              </Badge>
            )}
          </div>
          <p className="mt-2 font-mono text-xs text-muted-foreground">{relativeSeconds(data.health.lastSeenSeconds)}</p>
        </div>
      </section>

      <section className="panel mobile-paint-stable animate-rise delay-125">
        <div className="panel-head">
          <div>
            <p className="eyebrow">QRBiometric Live Feed</p>
            <p className="panel-sub mt-1">Student QR scan event feed</p>
          </div>
        </div>

        <div className="grid gap-4 p-4 lg:grid-cols-[1.35fr_1fr]">
          <div className="min-w-0">
            <div className="mb-4 flex items-center gap-2 text-muted-foreground">
              <ScanLine className="h-4 w-4 text-brand" />
              <h2 className="text-[0.85rem] font-semibold">Latest Scan</h2>
            </div>
            {featuredReading ? (
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                <QrStudentAvatar reading={featuredReading} size="lg" />
                <div className="min-w-0 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="min-w-0 break-words text-2xl font-semibold leading-tight text-foreground">{qrStudentDisplayName(featuredReading)}</p>
                    <QrEntryStateBadge state={featuredReading.entryState} />
                  </div>
                  <p className="break-words text-sm text-muted-foreground">Enrollment: <span className="font-mono text-foreground">{featuredReading.studentInfo?.enrollmentNo ?? "--"}</span></p>
                  {featuredReading.studentInfo?.bhawan && <p className="text-sm text-muted-foreground">Bhawan: <span className="font-mono text-foreground">{featuredReading.studentInfo.bhawan}</span></p>}
                  {featuredReading.studentInfo?.year && <p className="text-sm text-muted-foreground">Year: <span className="font-mono text-foreground">{featuredReading.studentInfo.year}</span></p>}
                  {featuredReading.studentInfo?.emailId && <p className="break-all text-sm text-muted-foreground">Email: <span className="font-mono text-foreground">{featuredReading.studentInfo.emailId}</span></p>}
                  <p className="font-mono text-xs text-muted-foreground">{featuredReading.entryState} time: {actualLatestTime}</p>
                </div>
              </div>
            ) : (
              <p className="font-mono text-xl font-semibold leading-snug text-foreground">No QR data yet</p>
            )}
            <p className="mt-4 break-all text-xs text-muted-foreground">Device: <span className="font-mono text-foreground">{featuredReading?.deviceId ?? "--"}</span></p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="tile min-w-0 p-4">
              <p className="text-[0.78rem] text-muted-foreground">Total Scans</p>
              <p className="telemetry-value mt-2 inline-flex items-center gap-2"><Database className="h-4 w-4 text-brand" />{hasLoadedData ? data.stats.totalScans : "--"}</p>
            </div>
            <div className="tile min-w-0 p-4">
              <p className="text-[0.78rem] text-muted-foreground">Unique QR Codes</p>
              <p className="telemetry-value mt-2 inline-flex items-center gap-2"><QrCode className="h-4 w-4 text-brand" />{hasLoadedData ? data.stats.uniqueCodes : "--"}</p>
            </div>
            <div className="tile min-w-0 p-4">
              <p className="text-[0.78rem] text-muted-foreground">Verification Stage</p>
              <p className="mt-2 inline-flex min-w-0 items-center gap-2 font-mono text-[0.86rem] text-foreground"><ShieldCheck className="h-4 w-4 shrink-0 text-brand" />Decode stored</p>
            </div>
            <div className="tile min-w-0 p-4">
              <p className="text-[0.78rem] text-muted-foreground">Last Update</p>
              <p className="mt-2 inline-flex min-w-0 items-center gap-2 font-mono text-[0.95rem] text-foreground"><Clock3 className="h-4 w-4 shrink-0 text-brand" />{actualLatestTime}</p>
              <p className="mt-1 font-mono text-xs text-muted-foreground">{relativeSeconds(data.health.lastSeenSeconds)}</p>
            </div>
          </div>
        </div>
      </section>

      {manualReading && (
        <section className="panel p-4 text-sm">
          <p className="font-semibold text-active">Last manual submission</p>
          <p className="mt-1 text-muted-foreground">
            {qrStudentDisplayName(manualReading)} marked {manualReading.entryState} at {formatClock(manualReading.timestamp)}
          </p>
        </section>
      )}

      <section className="panel animate-rise delay-185">
        <div className="panel-head">
          <div>
            <h2 className="panel-title">Recent QR Logs</h2>
            <p className="panel-sub">Last update {relativeSeconds(data.health.lastSeenSeconds)}</p>
          </div>
          <div className="relative w-full sm:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1) }} onKeyDown={(event) => { if (event.key === "Enter") { setLoading(true); void fetchData() } }} placeholder="Search logs" aria-label="Search logs" className="pl-9" />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted text-[0.85rem] text-muted-foreground">
                <th className="px-4 py-3 text-left font-semibold">State</th>
                <th className="px-4 py-3 text-left font-semibold">Device</th>
                <th className="px-4 py-3 text-left font-semibold">Student / QR</th>
                <th className="px-4 py-3 text-left font-semibold">Time</th>
              </tr>
            </thead>
            <tbody>
              {data.readings.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-muted-foreground">No QR scans found yet.</td>
                </tr>
              ) : (
                data.readings.map((reading) => (
                  <tr key={reading.id} className="border-b border-border last:border-b-0 hover:bg-muted/60">
                    <td className="px-4 py-3"><QrEntryStateBadge state={reading.entryState} /></td>
                    <td className="px-4 py-3 font-mono text-[0.86rem]">{reading.deviceId}</td>
                    <td className="max-w-[520px] px-4 py-3">
                      <QrStudentSummary reading={reading} />
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-[0.86rem] text-muted-foreground">{formatTime(reading.timestamp)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border p-4 text-sm text-muted-foreground">
          <span className="font-mono text-[0.86rem]">Page {data.pagination.page} of {data.pagination.totalPages} | {data.pagination.total} logs (maximum 100)</span>
          <div className="flex gap-2">
            <Button variant="outline" disabled={!data.pagination.hasPrevPage} onClick={() => setPage((value) => Math.max(1, value - 1))}>Previous</Button>
            <Button variant="outline" disabled={!data.pagination.hasNextPage} onClick={() => setPage((value) => value + 1)}>Next</Button>
          </div>
        </div>
      </section>
    </main>
  )
}
