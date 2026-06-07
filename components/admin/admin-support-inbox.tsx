"use client"

import { useCallback, useEffect, useState } from "react"
import { Headphones, RefreshCw, Search, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import type { SupportInquiry, SupportListResponse, SupportStatus } from "@/types/support"

const emptyData: SupportListResponse = {
  inquiries: [],
  stats: {
    total: 0,
    new: 0,
    inProgress: 0,
    resolved: 0,
  },
  pagination: {
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 1,
  },
}

function formatDate(value: string) {
  return new Date(value).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
}

function StatusBadge({ status }: { status: SupportStatus }) {
  const className = status === "resolved"
    ? "border-emerald-500/35 bg-emerald-500/10 text-emerald-300"
    : status === "in_progress"
      ? "border-orange-500/35 bg-orange-500/10 text-orange-300"
      : "border-sky-500/35 bg-sky-500/10 text-sky-300"
  return <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${className}`}>{status.replace("_", " ")}</span>
}

export function AdminSupportInbox() {
  const [data, setData] = useState<SupportListResponse>(emptyData)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [status, setStatus] = useState<SupportStatus | "all">("all")
  const [page, setPage] = useState(1)

  const fetchData = useCallback(async () => {
    try {
      const params = new URLSearchParams({ page: String(page), limit: "20" })
      if (search.trim()) params.set("search", search.trim())
      if (status !== "all") params.set("status", status)
      const response = await fetch(`/api/support?${params.toString()}`, { cache: "no-store" })
      if (!response.ok) return
      setData((await response.json()) as SupportListResponse)
    } finally {
      setLoading(false)
    }
  }, [page, search, status])

  useEffect(() => {
    void fetchData()
  }, [fetchData])

  async function updateStatus(inquiry: SupportInquiry, nextStatus: SupportStatus) {
    await fetch("/api/support", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: inquiry.id, status: nextStatus }),
    })
    await fetchData()
  }

  async function deleteInquiry(id: string) {
    if (!window.confirm("Delete this support request?")) return
    await fetch("/api/support", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    })
    await fetchData()
  }

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-orange-500/20 bg-card/75 p-5 shadow-2xl shadow-orange-950/20">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-orange-300">Support Inbox</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight">User issues and enquiries</h2>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">Review public support submissions, mark active work, resolve requests, or remove stale entries.</p>
          </div>
          <Button onClick={() => { setLoading(true); void fetchData() }} disabled={loading}>
            <RefreshCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
            Refresh
          </Button>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-border bg-card/75 p-5"><p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Total</p><p className="mt-2 font-mono text-3xl text-orange-100">{data.stats.total}</p></div>
        <div className="rounded-2xl border border-border bg-card/75 p-5"><p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">New</p><p className="mt-2 font-mono text-3xl text-sky-300">{data.stats.new}</p></div>
        <div className="rounded-2xl border border-border bg-card/75 p-5"><p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">In Progress</p><p className="mt-2 font-mono text-3xl text-orange-300">{data.stats.inProgress}</p></div>
        <div className="rounded-2xl border border-border bg-card/75 p-5"><p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Resolved</p><p className="mt-2 font-mono text-3xl text-emerald-300">{data.stats.resolved}</p></div>
      </section>

      <section className="rounded-3xl border border-border bg-card/75">
        <div className="flex flex-col gap-3 border-b border-border p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3"><Headphones className="h-5 w-5 text-orange-300" /><h3 className="text-lg font-semibold">Requests</h3></div>
          <div className="flex flex-wrap gap-2">
            <label className="relative w-full sm:w-72">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { setPage(1); setLoading(true); void fetchData() } }} placeholder="Search support" className="w-full rounded-xl border border-border bg-background/70 py-2 pl-9 pr-3 text-sm outline-none focus:border-orange-500" />
            </label>
            <select value={status} onChange={(event) => { setStatus(event.target.value as SupportStatus | "all"); setPage(1) }} className="rounded-xl border border-border bg-background/70 px-3 py-2 text-sm outline-none focus:border-orange-500">
              <option value="all">All</option>
              <option value="new">New</option>
              <option value="in_progress">In progress</option>
              <option value="resolved">Resolved</option>
            </select>
            <Button onClick={() => { setPage(1); setLoading(true); void fetchData() }}>Apply</Button>
          </div>
        </div>

        <div className="divide-y divide-border">
          {data.inquiries.length === 0 ? (
            <p className="p-10 text-center text-sm text-muted-foreground">No support requests found.</p>
          ) : data.inquiries.map((inquiry) => (
            <article key={inquiry.id} className="p-4 hover:bg-muted/20">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2"><StatusBadge status={inquiry.status} /><span className="font-mono text-xs text-muted-foreground">{formatDate(inquiry.createdAt)}</span></div>
                  <h4 className="mt-3 text-lg font-semibold">{inquiry.subject}</h4>
                  <p className="mt-1 text-sm text-muted-foreground">{inquiry.name} | {inquiry.email}</p>
                  <p className="mt-3 max-w-4xl text-sm leading-6 text-foreground/85">{inquiry.message}</p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={() => void updateStatus(inquiry, "in_progress")}>Mark active</Button>
                  <Button size="sm" onClick={() => void updateStatus(inquiry, "resolved")}>Resolve</Button>
                  <Button variant="destructive" size="sm" onClick={() => void deleteInquiry(inquiry.id)}><Trash2 className="h-3.5 w-3.5" />Delete</Button>
                </div>
              </div>
            </article>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm text-muted-foreground">
          <span>Page {data.pagination.page} of {data.pagination.totalPages} | {data.pagination.total} records</span>
          <div className="flex gap-2">
            <Button variant="outline" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Previous</Button>
            <Button variant="outline" disabled={page >= data.pagination.totalPages} onClick={() => setPage((value) => value + 1)}>Next</Button>
          </div>
        </div>
      </section>
    </div>
  )
}
