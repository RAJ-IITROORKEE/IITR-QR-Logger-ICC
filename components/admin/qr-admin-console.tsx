"use client"

import { useCallback, useEffect, useState } from "react"
import { Activity, BarChart3, CalendarDays, Database, Download, RefreshCw, Search, Trash2, Users } from "lucide-react"

import { Button } from "@/components/ui/button"
import { QrEntryStateBadge, QrScanDetailsDialog, QrStudentAvatar, qrStudentDisplayName } from "@/components/qr-biometric/qr-student-scan-details"
import type { QrBiometricApiResponse, QrBiometricReading } from "@/types/qr-biometric"

type Mode = "dashboard" | "logs" | "analytics"
type SortKey = "createdAt" | "deviceId" | "entryState" | "scanStatus"
type SortOrder = "asc" | "desc"

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
    <div className="rounded-2xl border border-border bg-card/75 p-5">
      <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
      <p className="mt-2 font-mono text-3xl font-semibold text-orange-100">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{caption}</p>
    </div>
  )
}

function AdminStudentSummary({ reading, avatarSize = "sm" }: { reading: QrBiometricReading; avatarSize?: "sm" | "lg" }) {
  const info = reading.studentInfo

  return (
    <div className="flex min-w-[280px] items-center gap-3">
      <QrStudentAvatar reading={reading} size={avatarSize} />
      <div className="min-w-0 space-y-1">
        <p className="truncate font-semibold text-foreground">{qrStudentDisplayName(reading)}</p>
        <p className="text-xs text-muted-foreground">Enrollment: <span className="font-mono text-foreground">{info?.enrollmentNo ?? "--"}</span></p>
        <p className="truncate text-xs text-muted-foreground">Email: <span className="font-mono text-foreground">{info?.emailId ?? "--"}</span></p>
      </div>
    </div>
  )
}

export function QrAdminConsole({ mode }: { mode: Mode }) {
  const [data, setData] = useState<QrBiometricApiResponse>(emptyData)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [sort, setSort] = useState<SortKey>("createdAt")
  const [order, setOrder] = useState<SortOrder>("desc")
  const [month, setMonth] = useState("")
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")
  const [page, setPage] = useState(1)
  const limit = mode === "dashboard" ? 12 : 25

  const fetchData = useCallback(async () => {
    try {
      const params = new URLSearchParams({ limit: String(limit), page: String(page), sort, order })
      if (search.trim()) params.set("search", search.trim())
      if (month) params.set("month", month)
      if (from) params.set("from", from)
      if (to) params.set("to", to)
      const response = await fetch(`/api/qr-biometric-icc?${params.toString()}`, { cache: "no-store" })
      if (!response.ok) return
      setData((await response.json()) as QrBiometricApiResponse)
    } finally {
      setLoading(false)
    }
  }, [from, limit, month, order, page, search, sort, to])

  useEffect(() => {
    void fetchData()
    const interval = window.setInterval(() => void fetchData(), 12000)
    return () => window.clearInterval(interval)
  }, [fetchData])

  async function deleteReading(id: string) {
    if (!window.confirm("Delete this QR log?")) return
    await fetch("/api/qr-biometric-icc", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    })
    await fetchData()
  }

  async function clearScopedLogs() {
    const label = month || from || to ? "selected timeline" : "all QR logs"
    if (!window.confirm(`Clear ${label}? This cannot be undone.`)) return
    await fetch("/api/qr-biometric-icc", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clearAll: true, month: month || undefined, from: from || undefined, to: to || undefined }),
    })
    setPage(1)
    await fetchData()
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
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => { setLoading(true); void fetchData() }} disabled={loading}>
              <RefreshCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
              Refresh
            </Button>
            <Button asChild variant="outline">
              <a href={exportHref(month, from, to)}>
                <Download className="h-4 w-4" />
                Export CSV
              </a>
            </Button>
            {mode === "logs" && (
              <Button variant="destructive" onClick={() => void clearScopedLogs()}>
                <Trash2 className="h-4 w-4" />
                Clear
              </Button>
            )}
          </div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Daily Logs" value={data.stats.dailyScans ?? 0} caption="Scans captured today" />
        <StatCard label="Monthly Logs" value={data.stats.monthlyScans ?? 0} caption="Current month total" />
        <StatCard label="Students Inside" value={data.stats.currentIn} caption="Latest IN state count" />
        <StatCard label="Devices" value={data.stats.uniqueDevices} caption="Unique reporting device IDs" />
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
                    <span className="font-mono text-xs text-muted-foreground">{data.latest.deviceId}</span>
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
          <div className="mt-5 grid grid-cols-3 gap-3">
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
            <div className="flex flex-wrap gap-2">
              <label className="relative w-full sm:w-72">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { setPage(1); setLoading(true); void fetchData() } }} placeholder="Search student, device, QR" className="w-full rounded-xl border border-border bg-background/70 py-2 pl-9 pr-3 text-sm outline-none focus:border-orange-500" />
              </label>
              <input type="month" value={month} onChange={(event) => { setMonth(event.target.value); setPage(1) }} className="rounded-xl border border-border bg-background/70 px-3 py-2 text-sm outline-none focus:border-orange-500" />
              <input type="date" value={from} onChange={(event) => { setFrom(event.target.value); setPage(1) }} className="rounded-xl border border-border bg-background/70 px-3 py-2 text-sm outline-none focus:border-orange-500" />
              <input type="date" value={to} onChange={(event) => { setTo(event.target.value); setPage(1) }} className="rounded-xl border border-border bg-background/70 px-3 py-2 text-sm outline-none focus:border-orange-500" />
              <select value={sort} onChange={(event) => setSort(event.target.value as SortKey)} className="rounded-xl border border-border bg-background/70 px-3 py-2 text-sm outline-none focus:border-orange-500">
                <option value="createdAt">Time</option>
                <option value="deviceId">Device</option>
                <option value="entryState">State</option>
                <option value="scanStatus">Status</option>
              </select>
              <select value={order} onChange={(event) => setOrder(event.target.value as SortOrder)} className="rounded-xl border border-border bg-background/70 px-3 py-2 text-sm outline-none focus:border-orange-500">
                <option value="desc">Desc</option>
                <option value="asc">Asc</option>
              </select>
              <Button onClick={() => { setPage(1); setLoading(true); void fetchData() }}>Apply</Button>
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
        <section className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-3xl border border-border bg-card/75 p-5">
            <div className="flex items-center gap-3"><BarChart3 className="h-5 w-5 text-orange-300" /><h3 className="font-semibold">Device Distribution</h3></div>
            <div className="mt-5 space-y-3">
              {data.analysis.deviceSummaries.length === 0 ? <p className="text-sm text-muted-foreground">No device data yet.</p> : data.analysis.deviceSummaries.map((device) => (
                <div key={device.deviceId}>
                  <div className="mb-1 flex justify-between text-xs"><span>{device.deviceId}</span><span>{device.totalScans} scans</span></div>
                  <div className="h-2 rounded-full bg-muted"><div className="h-2 rounded-full bg-orange-500" style={{ width: `${Math.min(100, (device.totalScans / Math.max(1, data.stats.totalScans)) * 100)}%` }} /></div>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-3xl border border-border bg-card/75 p-5">
            <div className="flex items-center gap-3"><CalendarDays className="h-5 w-5 text-orange-300" /><h3 className="font-semibold">Timeline</h3></div>
            <div className="mt-5 space-y-3">
              {data.analysis.entryTimeline.length === 0 ? <p className="text-sm text-muted-foreground">No timeline data yet.</p> : data.analysis.entryTimeline.map((item) => (
                <div key={item.date} className="rounded-xl border border-border bg-background/50 p-3">
                  <div className="flex items-center justify-between text-sm"><span className="font-mono">{item.date}</span><span>{item.total} total</span></div>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-muted-foreground"><span>IN: {item.inCount}</span><span>OUT: {item.outCount}</span></div>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-3xl border border-border bg-card/75 p-5 lg:col-span-2">
            <div className="flex items-center gap-3"><Users className="h-5 w-5 text-orange-300" /><h3 className="font-semibold">Entry Summary</h3></div>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <StatCard label="Total Scans" value={data.stats.totalScans} caption="All matching filters" />
              <StatCard label="Unique Students" value={data.stats.uniqueCodes} caption="Unique QR URLs" />
              <StatCard label="Profiles Read" value={data.stats.scrapedStudents} caption="DOSW profile extraction" />
            </div>
          </div>
        </section>
      )}
    </div>
  )
}
