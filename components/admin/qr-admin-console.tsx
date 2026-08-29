"use client"

import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState, type ReactNode } from "react"
import { Area, AreaChart, Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"
import { Activity, ArrowUpDown, BarChart3, CalendarDays, Database, Download, Eye, LineChart, RefreshCw, Search, Trash2, Users } from "lucide-react"

import { Button } from "@/components/ui/button"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { QrDecodedPayloadLink, QrEntryStateBadge, QrScanDetailsDialog, QrStudentAvatar, QrStudentInfoPanel, qrStudentDisplayName } from "@/components/qr-biometric/qr-student-scan-details"
import type { QrBiometricApiResponse, QrBiometricReading, QrBiometricStudentSummary } from "@/types/qr-biometric"

type Mode = "dashboard" | "logs" | "analytics"
type SortKey = "createdAt" | "deviceId" | "entryState" | "scanStatus"
type SortOrder = "asc" | "desc"
type StudentSortKey = "displayName" | "enrollmentNo" | "latestState" | "totalLogs" | "lastSeenAt"

const STUDENT_PAGE_SIZE = 10
const timelineChartConfig = {
  total: { label: "Total", color: "var(--chart-1)" },
  inCount: { label: "IN", color: "var(--chart-2)" },
  outCount: { label: "OUT", color: "var(--chart-5)" },
} satisfies ChartConfig

const studentActivityChartConfig = {
  inCount: { label: "IN", color: "var(--chart-2)" },
  outCount: { label: "OUT", color: "var(--chart-5)" },
} satisfies ChartConfig

const emptyData: QrBiometricApiResponse = {
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
    dailyIn: 0,
    dailyOut: 0,
    qrDeviceScans: 0,
    manualScans: 0,
    monthlyScans: 0,
    lastScanAt: null,
    avgCharacters: null,
  },
  analysis: {
    totalScans: 0,
    uniqueCodes: 0,
    uniqueDevices: 0,
    currentIn: 0,
    currentOut: 0,
    scrapedStudents: 0,
    dailyScans: 0,
    dailyIn: 0,
    dailyOut: 0,
    qrDeviceScans: 0,
    manualScans: 0,
    monthlyScans: 0,
    lastScanAt: null,
    avgCharacters: null,
    latestDecodedData: null,
    latestDeviceId: null,
    latestStatus: null,
    latestEntryState: null,
    latestStudentInfo: null,
    deviceSummaries: [],
    entryTimeline: [],
    studentSummaries: [],
  },
  pagination: {
    page: 1,
    limit: 25,
    total: 0,
    totalPages: 1,
    hasNextPage: false,
    hasPrevPage: false,
  },
  health: {
    status: "offline",
    lastSeenSeconds: null,
  },
  system: {
    dbConnected: false,
    queuedWrites: 0,
    flushedWrites: 0,
    liveBufferCount: 0,
  },
  success: true,
  module: "qr-biometric-icc",
  endpoint: "/api/qr-biometric-icc",
  storage: "memory",
  expectedPayload: { deviceId: "", decodedData: "" },
  query: { limit: 25, page: 1, deviceId: null, search: null, sort: "createdAt", order: "desc", from: null, to: null, month: null },
  count: 0,
  totalCount: 0,
  serverTime: new Date(0).toISOString(),
  warning: null,
}

function formatDate(value: string | null | undefined) {
  if (!value) return "--"
  return new Date(value).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
}

function exportHref(month: string, from: string, to: string) {
  const params = new URLSearchParams()
  if (month) params.set("month", month)
  if (from) params.set("from", from)
  if (to) params.set("to", to)
  const query = params.toString()
  return `/api/qr-biometric-icc/export${query ? `?${query}` : ""}`
}

function StatCard({ label, value, caption }: { label: string; value: number | string; caption: string }) {
  return (
    <div className="min-w-0 rounded-2xl border border-border bg-card/75 p-5">
      <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
      <p className="mt-2 break-words font-mono text-3xl font-semibold text-orange-100">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{caption}</p>
    </div>
  )
}

function AdminStudentSummary({ reading, avatarSize = "sm" }: { reading: QrBiometricReading; avatarSize?: "sm" | "lg" }) {
  const info = reading.studentInfo

  return (
    <div className="flex min-w-0 items-center gap-3 sm:min-w-[280px]">
      <QrStudentAvatar reading={reading} size={avatarSize} />
      <div className="min-w-0 space-y-1">
        <p className="truncate font-semibold text-foreground">{qrStudentDisplayName(reading)}</p>
        <p className="truncate text-xs text-muted-foreground">Enrollment: <span className="font-mono text-foreground">{info?.enrollmentNo ?? "--"}</span></p>
        <p className="truncate text-xs text-muted-foreground">Email: <span className="font-mono text-foreground">{info?.emailId ?? "--"}</span></p>
      </div>
    </div>
  )
}

function compareStudentValues(a: QrBiometricStudentSummary, b: QrBiometricStudentSummary, sortKey: StudentSortKey, order: SortOrder) {
  const dir = order === "asc" ? 1 : -1
  if (sortKey === "totalLogs") return (a.totalLogs - b.totalLogs) * dir
  if (sortKey === "lastSeenAt") return (new Date(a.lastSeenAt).getTime() - new Date(b.lastSeenAt).getTime()) * dir
  return String(a[sortKey] ?? "").localeCompare(String(b[sortKey] ?? "")) * dir
}

function StudentSortButton({ active, children, onClick }: { active: boolean; children: ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={`inline-flex items-center gap-1 rounded-md px-1 py-0.5 transition-colors hover:bg-orange-500/10 hover:text-orange-300 ${active ? "text-orange-300" : ""}`}>
      {children}
      <ArrowUpDown className="size-3" />
    </button>
  )
}

function AnalyticsTimelineChart({ timeline }: { timeline: QrBiometricApiResponse["analysis"]["entryTimeline"] }) {
  const chartData = useMemo(() => [...timeline].reverse().map((item) => ({ ...item, label: new Date(item.date).toLocaleDateString([], { month: "short", day: "numeric" }) })), [timeline])

  if (chartData.length === 0) return <p className="text-sm text-muted-foreground">No timeline data yet.</p>

  return (
    <div className="mt-4 rounded-2xl border border-orange-500/15 bg-background/55 p-3">
      <ChartContainer config={timelineChartConfig} className="h-[210px] w-full aspect-auto" initialDimension={{ width: 520, height: 210 }}>
        <AreaChart data={chartData} margin={{ left: -18, right: 8, top: 12, bottom: 0 }}>
          <defs>
            <linearGradient id="timelineTotal" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--color-total)" stopOpacity={0.42} />
              <stop offset="95%" stopColor="var(--color-total)" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} interval="preserveStartEnd" />
          <YAxis tickLine={false} axisLine={false} allowDecimals={false} width={34} />
          <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="dot" labelFormatter={(_, payload) => payload?.[0]?.payload?.date ?? "Timeline"} />} />
          <Area type="monotone" dataKey="total" stroke="var(--color-total)" fill="url(#timelineTotal)" strokeWidth={2.5} isAnimationActive animationDuration={650} />
          <Area type="monotone" dataKey="inCount" stroke="var(--color-inCount)" fill="transparent" strokeWidth={2} isAnimationActive animationDuration={750} />
          <Area type="monotone" dataKey="outCount" stroke="var(--color-outCount)" fill="transparent" strokeWidth={2} isAnimationActive animationDuration={850} />
        </AreaChart>
      </ChartContainer>
      <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-muted-foreground">
        <span className="rounded-lg bg-orange-500/10 px-2 py-1 text-orange-200">Total: {timeline.reduce((sum, item) => sum + item.total, 0)}</span>
        <span className="rounded-lg bg-emerald-500/10 px-2 py-1 text-emerald-300">IN: {timeline.reduce((sum, item) => sum + item.inCount, 0)}</span>
        <span className="rounded-lg bg-red-500/10 px-2 py-1 text-red-300">OUT: {timeline.reduce((sum, item) => sum + item.outCount, 0)}</span>
      </div>
    </div>
  )
}

function StudentActivityDialog({ student }: { student: QrBiometricStudentSummary }) {
  const chartData = useMemo(() => student.logs.slice().reverse().map((log, index) => ({
    index: index + 1,
    label: formatDate(log.timestamp),
    deviceId: log.deviceId,
    state: log.entryState,
    inCount: log.entryState === "IN" ? 1 : 0,
    outCount: log.entryState === "OUT" ? 1 : 0,
  })), [student.logs])

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="border-orange-500/30 bg-orange-500/10 text-orange-500 hover:bg-orange-500/20 hover:text-orange-400">
          <LineChart className="size-3.5" />
          View logs
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-5xl border-orange-500/30 bg-card">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2 text-base">
            Student Timeline Activity
            <QrEntryStateBadge state={student.latestState} />
          </DialogTitle>
          <DialogDescription>{student.displayName} has {student.totalLogs} logs from {formatDate(student.firstSeenAt)} to {formatDate(student.lastSeenAt)}.</DialogDescription>
        </DialogHeader>
        <div className="rounded-2xl border border-orange-500/15 bg-background/60 p-3">
          <ChartContainer config={studentActivityChartConfig} className="h-[240px] w-full aspect-auto" initialDimension={{ width: 720, height: 240 }}>
            <BarChart data={chartData} margin={{ left: -18, right: 8, top: 10, bottom: 0 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis dataKey="index" tickLine={false} axisLine={false} tickMargin={8} />
              <YAxis tickLine={false} axisLine={false} allowDecimals={false} width={34} />
              <ChartTooltip content={<ChartTooltipContent labelFormatter={(_, payload) => payload?.[0]?.payload?.label ?? "Log"} />} />
              <Bar dataKey="inCount" stackId="activity" fill="var(--color-inCount)" radius={[6, 6, 0, 0]} isAnimationActive animationDuration={700} />
              <Bar dataKey="outCount" stackId="activity" fill="var(--color-outCount)" radius={[6, 6, 0, 0]} isAnimationActive animationDuration={850} />
            </BarChart>
          </ChartContainer>
        </div>
        <div className="max-h-[280px] space-y-2 overflow-y-auto pr-1">
          {student.logs.map((log) => (
            <div key={log.id} className="grid gap-2 rounded-xl border border-border bg-background/65 p-3 text-sm sm:grid-cols-[auto_1fr_auto] sm:items-center">
              <QrEntryStateBadge state={log.entryState} />
              <div className="min-w-0">
                <p className="font-mono text-xs text-muted-foreground">{formatDate(log.timestamp)}</p>
                <p className="truncate text-xs text-muted-foreground">Device: <span className="font-mono text-foreground">{log.deviceId}</span></p>
              </div>
              <QrDecodedPayloadLink reading={log} className="text-[11px]" />
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function StudentDetailsDialog({ student }: { student: QrBiometricStudentSummary }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Eye className="size-3.5" />
          View details
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-6xl border-orange-500/30 bg-card">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2 text-base">
            Registered Student Details
            <QrEntryStateBadge state={student.latestState} />
          </DialogTitle>
          <DialogDescription>Latest known profile, entry state, device, QR payload, and scan totals for this student.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-4">
          <div className="rounded-xl border border-border bg-background/70 p-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Logs</p>
            <p className="mt-1 font-mono text-lg font-semibold text-foreground">{student.totalLogs}</p>
          </div>
          <div className="rounded-xl border border-border bg-background/70 p-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">IN / OUT</p>
            <p className="mt-1 font-mono text-lg font-semibold text-foreground">{student.inCount} / {student.outCount}</p>
          </div>
          <div className="rounded-xl border border-border bg-background/70 p-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Last Device</p>
            <p className="mt-1 break-all font-mono text-xs font-semibold text-foreground">{student.latestReading.deviceId}</p>
          </div>
          <div className="rounded-xl border border-border bg-background/70 p-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Last Seen</p>
            <p className="mt-1 font-mono text-xs font-semibold text-foreground">{formatDate(student.lastSeenAt)}</p>
          </div>
        </div>
        <QrStudentInfoPanel reading={student.latestReading} />
      </DialogContent>
    </Dialog>
  )
}

function StudentRegistryTable({ students }: { students: QrBiometricStudentSummary[] }) {
  const [query, setQuery] = useState("")
  const [sortKey, setSortKey] = useState<StudentSortKey>("lastSeenAt")
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc")
  const [page, setPage] = useState(1)

  const visibleStudents = useMemo(() => {
    const lowered = query.trim().toLowerCase()
    const filtered = lowered
      ? students.filter((student) => [student.displayName, student.enrollmentNo, student.emailId, student.bhawan, student.latestState, student.latestReading.deviceId].join(" ").toLowerCase().includes(lowered))
      : students
    return [...filtered].sort((a, b) => compareStudentValues(a, b, sortKey, sortOrder))
  }, [query, sortKey, sortOrder, students])

  const totalPages = Math.max(1, Math.ceil(visibleStudents.length / STUDENT_PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const pageStudents = visibleStudents.slice((safePage - 1) * STUDENT_PAGE_SIZE, safePage * STUDENT_PAGE_SIZE)

  function setSort(nextKey: StudentSortKey) {
    setPage(1)
    if (nextKey === sortKey) {
      setSortOrder((value) => (value === "asc" ? "desc" : "asc"))
      return
    }
    setSortKey(nextKey)
    setSortOrder(nextKey === "displayName" || nextKey === "enrollmentNo" ? "asc" : "desc")
  }

  return (
    <section className="rounded-3xl border border-border bg-card/75">
      <div className="flex flex-col gap-3 border-b border-border p-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-3"><Users className="h-5 w-5 text-orange-300" /><h3 className="text-lg font-semibold">Registered Students</h3></div>
          <p className="mt-1 text-xs text-muted-foreground">Unique students derived from saved QR scan history. Search, sort, and view full activity.</p>
        </div>
        <label className="relative w-full lg:w-80">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1) }} placeholder="Search name, enrollment, email" className="w-full rounded-xl border border-border bg-background/70 py-2 pl-9 pr-3 text-sm outline-none focus:border-orange-500" />
        </label>
      </div>
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/30 text-xs uppercase tracking-[0.14em] text-muted-foreground hover:bg-muted/30">
            <TableHead><StudentSortButton active={sortKey === "latestState"} onClick={() => setSort("latestState")}>State</StudentSortButton></TableHead>
            <TableHead><StudentSortButton active={sortKey === "displayName"} onClick={() => setSort("displayName")}>Student</StudentSortButton></TableHead>
            <TableHead><StudentSortButton active={sortKey === "enrollmentNo"} onClick={() => setSort("enrollmentNo")}>Enrollment</StudentSortButton></TableHead>
            <TableHead><StudentSortButton active={sortKey === "totalLogs"} onClick={() => setSort("totalLogs")}>Logs</StudentSortButton></TableHead>
            <TableHead><StudentSortButton active={sortKey === "lastSeenAt"} onClick={() => setSort("lastSeenAt")}>Last Seen</StudentSortButton></TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {pageStudents.length === 0 ? (
            <TableRow><TableCell colSpan={6} className="py-10 text-center text-muted-foreground">No students found.</TableCell></TableRow>
          ) : pageStudents.map((student) => (
            <TableRow key={student.id}>
              <TableCell><QrEntryStateBadge state={student.latestState} /></TableCell>
              <TableCell className="max-w-[320px]">
                <div className="flex min-w-0 items-center gap-3">
                  <QrStudentAvatar reading={student.latestReading} />
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-foreground">{student.displayName}</p>
                    <p className="truncate text-xs text-muted-foreground">{student.emailId ?? "No email saved"}</p>
                  </div>
                </div>
              </TableCell>
              <TableCell className="font-mono text-xs">{student.enrollmentNo ?? "--"}</TableCell>
              <TableCell className="font-mono text-xs">{student.totalLogs} <span className="text-muted-foreground">({student.inCount} IN / {student.outCount} OUT)</span></TableCell>
              <TableCell className="font-mono text-xs text-muted-foreground">{formatDate(student.lastSeenAt)}</TableCell>
              <TableCell>
                <div className="flex flex-wrap justify-end gap-2">
                  <StudentActivityDialog student={student} />
                  <StudentDetailsDialog student={student} />
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm text-muted-foreground">
        <span>Page {safePage} of {totalPages} | {visibleStudents.length} students | 10 per page</span>
        <div className="flex gap-2">
          <Button variant="outline" disabled={safePage <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Previous</Button>
          <Button variant="outline" disabled={safePage >= totalPages} onClick={() => setPage((value) => value + 1)}>Next</Button>
        </div>
      </div>
    </section>
  )
}

export function QrAdminConsole({ mode }: { mode: Mode }) {
  const [data, setData] = useState<QrBiometricApiResponse>(emptyData)
  const [loading, setLoading] = useState(true)
  const [hasLoadedData, setHasLoadedData] = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [sort, setSort] = useState<SortKey>("createdAt")
  const [order, setOrder] = useState<SortOrder>("desc")
  const [month, setMonth] = useState("")
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")
  const [page, setPage] = useState(1)
  const [actionMessage, setActionMessage] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const fetchControllerRef = useRef<AbortController | null>(null)
  const changeSequenceRef = useRef<string | null>(null)
  const limit = mode === "dashboard" ? 12 : 25

  const fetchData = useCallback(async () => {
    fetchControllerRef.current?.abort()
    const controller = new AbortController()
    fetchControllerRef.current = controller

    try {
      const params = new URLSearchParams({ limit: String(limit), page: String(page), sort, order })
      if (search.trim()) params.set("search", search.trim())
      if (month) params.set("month", month)
      if (from) params.set("from", from)
      if (to) params.set("to", to)
      const response = await fetch(`/api/qr-biometric-icc?${params.toString()}`, { cache: "no-store", signal: controller.signal })
      const result = (await response.json().catch(() => null)) as (QrBiometricApiResponse & { error?: string }) | null
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
  }, [from, limit, month, order, page, search, sort, to])

  const refreshForChange = useEffectEvent(async () => {
    await fetchData()
  })

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
            console.warn("QR admin change polling failed", error)
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

  async function deleteReading(id: string) {
    if (!window.confirm("Delete this QR log?")) return
    setActionMessage(null)
    setActionError(null)
    try {
      const response = await fetch("/api/qr-biometric-icc", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      })
      const result = (await response.json().catch(() => ({}))) as { success?: boolean; error?: string; deletedCount?: number }
      if (!response.ok || !result.success) throw new Error(result.error ?? "The log could not be deleted")
      setActionMessage(`Deleted ${result.deletedCount ?? 1} log. Device retries for this scan will be rejected.`)
      await fetchData()
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "The log could not be deleted")
    }
  }

  async function clearScopedLogs() {
    const label = month || from || to ? "selected timeline" : "all QR logs"
    if (!window.confirm(`Clear ${label}? This cannot be undone.`)) return
    setActionMessage(null)
    setActionError(null)
    try {
      let deletedCount = 0
      let hasMore = true
      while (hasMore) {
        const response = await fetch("/api/qr-biometric-icc", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clearAll: true, month: month || undefined, from: from || undefined, to: to || undefined }),
        })
        const result = (await response.json().catch(() => ({}))) as { success?: boolean; error?: string; deletedCount?: number; hasMore?: boolean }
        if (!response.ok || !result.success) throw new Error(result.error ?? "Logs could not be cleared")
        const deletedThisBatch = result.deletedCount ?? 0
        deletedCount += deletedThisBatch
        hasMore = Boolean(result.hasMore)
        if (hasMore && deletedThisBatch === 0) throw new Error("Log deletion made no progress")
      }
      setActionMessage(`Deleted ${deletedCount} logs. The selected records are tombstoned against device replay.`)
      setPage(1)
      await fetchData()
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Logs could not be cleared")
    }
  }

  const title = mode === "dashboard" ? "Admin Dashboard" : mode === "logs" ? "QR Logs" : "Analytics"

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-orange-500/20 bg-card/75 p-5 shadow-2xl shadow-orange-950/20">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-orange-300">{title}</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight">ICC QR biometric operations</h2>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">Monitor live scans, student entry state, daily/monthly totals, searchable logs, and exportable timelines.</p>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap sm:justify-end">
            <Button onClick={() => { setLoading(true); void fetchData() }} disabled={loading} className="w-full sm:w-auto">
              <RefreshCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
              Refresh
            </Button>
            <Button asChild variant="outline" className="w-full sm:w-auto">
              <a href={exportHref(month, from, to)}>
                <Download className="h-4 w-4" />
                Export CSV
              </a>
            </Button>
            {mode === "logs" && (
              <Button variant="destructive" onClick={() => void clearScopedLogs()} className="w-full sm:w-auto">
                <Trash2 className="h-4 w-4" />
                Clear
              </Button>
            )}
          </div>
        </div>
      </section>

      {actionMessage ? <p className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">{actionMessage}</p> : null}
      {actionError ? <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{actionError}</p> : null}
      {fetchError ? <p role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">Dashboard data unavailable: {fetchError}{hasLoadedData ? " Showing the last successful update." : " Statistics are not available yet."}</p> : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Daily Logs" value={hasLoadedData ? (data.stats.dailyScans ?? 0) : "--"} caption="Scans captured today (Asia/Kolkata)" />
        <StatCard label="Monthly Logs" value={hasLoadedData ? (data.stats.monthlyScans ?? 0) : "--"} caption="Current month total (Asia/Kolkata)" />
        <StatCard label="Students Inside" value={hasLoadedData ? data.stats.currentIn : "--"} caption="Latest IN state count" />
        <StatCard label="Devices" value={hasLoadedData ? data.stats.uniqueDevices : "--"} caption="Unique reporting device IDs" />
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-2xl border border-border bg-card/75 p-5">
          <div className="flex items-center gap-3">
            <Activity className="h-5 w-5 text-orange-300" />
            <div>
              <h3 className="font-semibold">Latest Scan</h3>
              <p className="text-xs text-muted-foreground">Device health: {data.health.status.toUpperCase()}</p>
            </div>
          </div>
          {data.latest ? (
            <div className="mt-5 rounded-2xl border border-orange-500/20 bg-orange-500/10 p-4">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <QrEntryStateBadge state={data.latest.entryState} />
                    <span className="break-all font-mono text-xs text-muted-foreground">{data.latest.deviceId}</span>
                  </div>
                  <div className="mt-4">
                    <AdminStudentSummary reading={data.latest} avatarSize="lg" />
                  </div>
                  <p className="mt-2 font-mono text-xs text-muted-foreground">{formatDate(data.latest.timestamp)}</p>
                  <div className="mt-4">
                    <QrScanDetailsDialog reading={data.latest} />
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <p className="mt-5 rounded-2xl border border-dashed border-border p-6 text-sm text-muted-foreground">No scan received yet.</p>
          )}
        </div>

        <div className="rounded-2xl border border-border bg-card/75 p-5">
          <div className="flex items-center gap-3">
            <Database className="h-5 w-5 text-orange-300" />
            <div>
              <h3 className="font-semibold">System State</h3>
              <p className="text-xs text-muted-foreground">Live buffer and persistence queue</p>
            </div>
          </div>
          <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <StatCard label="DB" value={data.system.dbConnected ? "OK" : "OFF"} caption="connection" />
            <StatCard label="Buffer" value={data.system.liveBufferCount} caption="memory logs" />
            <StatCard label="Queued" value={data.system.queuedWrites} caption="DB writes" />
          </div>
        </div>
      </section>

      {(mode === "logs" || mode === "dashboard") && (
        <section className="rounded-3xl border border-border bg-card/75">
          <div className="flex flex-col gap-3 border-b border-border p-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <h3 className="text-lg font-semibold">Logged Students</h3>
              <p className="text-xs text-muted-foreground">Search, sort, delete, clear, and export QR biometric records.</p>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:flex xl:flex-wrap xl:justify-end">
              <label className="relative w-full sm:w-72">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { setPage(1); setLoading(true); void fetchData() } }} placeholder="Search student, device, QR" className="w-full rounded-xl border border-border bg-background/70 py-2 pl-9 pr-3 text-sm outline-none focus:border-orange-500" />
              </label>
              <input type="month" value={month} onChange={(event) => { setMonth(event.target.value); setPage(1) }} className="w-full rounded-xl border border-border bg-background/70 px-3 py-2 text-sm outline-none focus:border-orange-500 xl:w-auto" />
              <input type="date" value={from} onChange={(event) => { setFrom(event.target.value); setPage(1) }} className="w-full rounded-xl border border-border bg-background/70 px-3 py-2 text-sm outline-none focus:border-orange-500 xl:w-auto" />
              <input type="date" value={to} onChange={(event) => { setTo(event.target.value); setPage(1) }} className="w-full rounded-xl border border-border bg-background/70 px-3 py-2 text-sm outline-none focus:border-orange-500 xl:w-auto" />
              <select value={sort} onChange={(event) => setSort(event.target.value as SortKey)} className="w-full rounded-xl border border-border bg-background/70 px-3 py-2 text-sm outline-none focus:border-orange-500 xl:w-auto">
                <option value="createdAt">Time</option>
                <option value="deviceId">Device</option>
                <option value="entryState">State</option>
                <option value="scanStatus">Status</option>
              </select>
              <select value={order} onChange={(event) => setOrder(event.target.value as SortOrder)} className="w-full rounded-xl border border-border bg-background/70 px-3 py-2 text-sm outline-none focus:border-orange-500 xl:w-auto">
                <option value="desc">Desc</option>
                <option value="asc">Asc</option>
              </select>
              <Button onClick={() => { setPage(1); setLoading(true); void fetchData() }} className="w-full xl:w-auto">Apply</Button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30 text-xs uppercase tracking-[0.14em] text-muted-foreground">
                  <th className="px-4 py-3 text-left font-medium">State</th>
                  <th className="px-4 py-3 text-left font-medium">Student</th>
                  <th className="px-4 py-3 text-left font-medium">Device</th>
                  <th className="px-4 py-3 text-left font-medium">Time</th>
                  <th className="px-4 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.readings.length === 0 ? (
                  <tr><td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">No logs found.</td></tr>
                ) : data.readings.map((reading) => (
                  <tr key={reading.id} className="border-b border-border/60 hover:bg-muted/20">
                    <td className="px-4 py-3"><QrEntryStateBadge state={reading.entryState} /></td>
                    <td className="max-w-[460px] px-4 py-3"><AdminStudentSummary reading={reading} /></td>
                    <td className="px-4 py-3 font-mono text-xs">{reading.deviceId}</td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{formatDate(reading.timestamp)}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <QrScanDetailsDialog reading={reading} />
                        <Button variant="destructive" size="sm" onClick={() => void deleteReading(reading.id)}><Trash2 className="h-3.5 w-3.5" />Delete</Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm text-muted-foreground">
            <span>Page {data.pagination.page} of {data.pagination.totalPages} | {data.pagination.total} records</span>
            <div className="flex gap-2">
              <Button variant="outline" disabled={!data.pagination.hasPrevPage} onClick={() => setPage((value) => Math.max(1, value - 1))}>Previous</Button>
              <Button variant="outline" disabled={!data.pagination.hasNextPage} onClick={() => setPage((value) => value + 1)}>Next</Button>
            </div>
          </div>
        </section>
      )}

      {mode === "analytics" && (
        <>
          <section className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
            <div className="rounded-3xl border border-border bg-card/75 p-5">
              <div className="flex items-center gap-3"><BarChart3 className="h-5 w-5 text-orange-300" /><h3 className="font-semibold">Device Distribution</h3></div>
              <div className="mt-5 space-y-3">
                {data.analysis.deviceSummaries.length === 0 ? <p className="text-sm text-muted-foreground">No device data yet.</p> : data.analysis.deviceSummaries.map((device) => (
                  <div key={device.deviceId} className="rounded-xl border border-border bg-background/45 p-3 transition-colors hover:border-orange-500/30 hover:bg-orange-500/5">
                    <div className="mb-2 flex justify-between gap-3 text-xs"><span className="break-all font-mono">{device.deviceId}</span><span className="shrink-0">{device.totalScans} scans</span></div>
                    <div className="h-2 rounded-full bg-muted"><div className="h-2 rounded-full bg-orange-500 transition-all duration-700" style={{ width: `${Math.min(100, (device.totalScans / Math.max(1, data.stats.totalScans)) * 100)}%` }} /></div>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-3xl border border-border bg-card/75 p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3"><CalendarDays className="h-5 w-5 text-orange-300" /><h3 className="font-semibold">Entry Timeline</h3></div>
                <span className="rounded-full border border-orange-500/20 bg-orange-500/10 px-3 py-1 text-xs text-orange-200">Last {data.analysis.entryTimeline.length || 0} days</span>
              </div>
              <AnalyticsTimelineChart timeline={data.analysis.entryTimeline} />
            </div>
            <div className="rounded-3xl border border-border bg-card/75 p-5 xl:col-span-2">
              <div className="flex items-center gap-3"><Users className="h-5 w-5 text-orange-300" /><h3 className="font-semibold">Entry Summary</h3></div>
              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                <StatCard label="Total Scans" value={data.stats.totalScans} caption="All matching filters" />
                <StatCard label="Unique Students" value={data.analysis.studentSummaries.length} caption="Registered student rows" />
                <StatCard label="Profiles Read" value={data.stats.scrapedStudents} caption="DOSW profile extraction" />
              </div>
            </div>
          </section>
          <StudentRegistryTable students={data.analysis.studentSummaries} />
        </>
      )}
    </div>
  )
}
