"use client"

import { useEffect, useState } from "react"
import { Fingerprint, RefreshCw, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

type FingerprintEnrollment = {
  id: string
  deviceId: string
  enrollmentKey: string
  fingerprintSlot: number
  fingerprintIndex: number | null
  enabled: boolean
  createdAt: string
  updatedAt: string
}

export function AdminFingerprintSettings() {
  const [enrollments, setEnrollments] = useState<FingerprintEnrollment[]>([])
  const [deviceId, setDeviceId] = useState("")
  const [enrollmentKey, setEnrollmentKey] = useState("")
  const [fingerprintSlot, setFingerprintSlot] = useState("")
  const [fingerprintIndex, setFingerprintIndex] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function refresh() {
    setPending(true)
    setError(null)
    try {
      const response = await fetch("/api/admin/fingerprint/enrollments", { cache: "no-store" })
      const result = await response.json() as { success?: boolean; error?: string; enrollments?: FingerprintEnrollment[] }
      if (!response.ok || !result.success) throw new Error(result.error ?? "Failed to load fingerprint enrollments")
      setEnrollments(result.enrollments ?? [])
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to load fingerprint enrollments")
    } finally {
      setPending(false)
    }
  }

  useEffect(() => {
    let cancelled = false
    void fetch("/api/admin/fingerprint/enrollments", { cache: "no-store" })
      .then(async (response) => {
        const result = await response.json() as { success?: boolean; error?: string; enrollments?: FingerprintEnrollment[] }
        if (!response.ok || !result.success) throw new Error(result.error ?? "Failed to load fingerprint enrollments")
        if (!cancelled) setEnrollments(result.enrollments ?? [])
      })
      .catch((requestError) => {
        if (!cancelled) setError(requestError instanceof Error ? requestError.message : "Failed to load fingerprint enrollments")
      })
    return () => { cancelled = true }
  }, [])

  async function addEnrollment() {
    setPending(true)
    setError(null)
    try {
      const response = await fetch("/api/admin/fingerprint/enrollments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          deviceId,
          enrollment: enrollmentKey,
          fingerprintSlot: Number(fingerprintSlot),
          ...(fingerprintIndex ? { fingerprintIndex: Number(fingerprintIndex) } : {}),
        }),
      })
      const result = await response.json() as { success?: boolean; error?: string; enrollment?: FingerprintEnrollment }
      if (!response.ok || !result.success || !result.enrollment) throw new Error(result.error ?? "Failed to create fingerprint enrollment")
      setEnrollments((current) => [result.enrollment!, ...current])
      setEnrollmentKey("")
      setFingerprintSlot("")
      setFingerprintIndex("")
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to create fingerprint enrollment")
    } finally {
      setPending(false)
    }
  }

  async function removeEnrollment(id: string) {
    if (!window.confirm("Remove this fingerprint mapping? Existing attendance events remain preserved.")) return
    setPending(true)
    setError(null)
    try {
      const response = await fetch("/api/admin/fingerprint/enrollments", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id }),
      })
      const result = await response.json() as { success?: boolean; error?: string }
      if (!response.ok || !result.success) throw new Error(result.error ?? "Failed to remove fingerprint enrollment")
      setEnrollments((current) => current.filter((item) => item.id !== id))
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to remove fingerprint enrollment")
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <Card className="border-orange-500/20 bg-card/75">
        <CardHeader>
          <div className="flex items-center gap-2"><Fingerprint className="size-5 text-orange-300" /><CardTitle>Fingerprint Attendance</CardTitle></div>
          <CardDescription>Map authenticated device fingerprint slots to student enrollment identifiers. Unmapped events stay pending until a mapping is added.</CardDescription>
        </CardHeader>
      </Card>

      {error ? <p className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">{error}</p> : null}

      <section className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
        <Card>
          <CardHeader><CardTitle>Add Mapping</CardTitle><CardDescription>Use the slot reported by the fingerprint device.</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2"><Label htmlFor="fingerprint-device">Device ID</Label><Input id="fingerprint-device" value={deviceId} onChange={(event) => setDeviceId(event.target.value)} placeholder="TAB5-001" /></div>
            <div className="space-y-2"><Label htmlFor="fingerprint-enrollment">Enrollment</Label><Input id="fingerprint-enrollment" value={enrollmentKey} onChange={(event) => setEnrollmentKey(event.target.value)} placeholder="24115114" /></div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2"><Label htmlFor="fingerprint-slot">Fingerprint slot</Label><Input id="fingerprint-slot" inputMode="numeric" value={fingerprintSlot} onChange={(event) => setFingerprintSlot(event.target.value)} placeholder="17" /></div>
              <div className="space-y-2"><Label htmlFor="fingerprint-index">Finger index (optional)</Label><Input id="fingerprint-index" inputMode="numeric" value={fingerprintIndex} onChange={(event) => setFingerprintIndex(event.target.value)} placeholder="2" /></div>
            </div>
            <Button disabled={pending} onClick={() => void addEnrollment()}>Add mapping</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0"><div><CardTitle>Mappings</CardTitle><CardDescription>{enrollments.length} configured fingerprint slots</CardDescription></div><Button size="icon" variant="outline" disabled={pending} onClick={() => void refresh()} aria-label="Refresh mappings"><RefreshCw className={pending ? "size-4 animate-spin" : "size-4"} /></Button></CardHeader>
          <CardContent>
            {enrollments.length === 0 ? <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">No fingerprint mappings configured.</p> : <div className="space-y-3">{enrollments.map((item) => <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3"><div><p className="font-mono text-sm">{item.deviceId} / slot {item.fingerprintSlot}</p><p className="text-sm text-muted-foreground">Enrollment {item.enrollmentKey}{item.fingerprintIndex === null ? "" : ` / finger ${item.fingerprintIndex}`}</p></div><Button size="icon" variant="ghost" onClick={() => void removeEnrollment(item.id)} aria-label={`Remove mapping for ${item.enrollmentKey}`}><Trash2 className="size-4" /></Button></div>)}</div>}
          </CardContent>
        </Card>
      </section>
    </div>
  )
}
