"use client"

import Image from "next/image"
import { AlertTriangle, ExternalLink, Eye } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { buildQrStudentPhotoProxySrc } from "@/lib/qr-biometric-student"
import { buildStoredStudentPhotoProxySrc } from "@/lib/qr-biometric-photo"
import type { QrBiometricReading } from "@/types/qr-biometric"

export function formatQrFullTimestamp(ts: string): string {
  return new Date(ts).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" })
}

export function qrStudentDisplayName(reading: QrBiometricReading | null): string {
  if (!reading) return "Waiting for first scan"
  return reading.studentInfo?.fullName ?? reading.studentInfo?.enrollmentNo ?? reading.decodedData
}

export function getQrDecodedHref(reading: QrBiometricReading): string | null {
  if (reading.decodedUrl) return reading.decodedUrl
  try {
    const url = new URL(reading.decodedData.trim())
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null
  } catch {
    return null
  }
}

export function QrEntryStateBadge({ state }: { state: QrBiometricReading["entryState"] }) {
  const variant = state === "IN" ? "active" : state === "OUT" ? "warning" : "secondary"
  return (
    <Badge variant={variant} className="gap-1.5 font-mono">
      <span aria-hidden="true" className="size-[7px] shrink-0 rounded-full bg-current" />
      {state}
    </Badge>
  )
}

export function QrDecodedPayloadLink({ reading, className = "" }: { reading: QrBiometricReading; className?: string }) {
  const href = getQrDecodedHref(reading)
  if (!href) {
    return <span className={`break-all font-mono text-xs text-muted-foreground ${className}`}>{reading.decodedData}</span>
  }

  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={`inline-flex max-w-full items-center gap-1 break-all font-mono text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline ${className}`}>
      <span className="min-w-0 break-all">{href}</span>
      <ExternalLink className="size-3 shrink-0" />
    </a>
  )
}

export function QrStudentAvatar({ reading, size = "sm" }: { reading: QrBiometricReading; size?: "sm" | "lg" }) {
  const info = reading.studentInfo
  const isLarge = size === "lg"
  const sizeClass = isLarge ? "size-24" : "size-11"
  const initials = (info?.fullName ?? info?.enrollmentNo ?? "QR").slice(0, 2).toUpperCase()
  const photoSrc = buildStoredStudentPhotoProxySrc(reading.studentPhotoUrl) ?? buildQrStudentPhotoProxySrc(info?.photoUrl, info?.enrollmentNo, getQrDecodedHref(reading))

  if (photoSrc) {
    return (
      <Image
        src={photoSrc}
        alt={`${qrStudentDisplayName(reading)} profile photo`}
        width={isLarge ? 96 : 44}
        height={isLarge ? 96 : 44}
        unoptimized
        className={`${sizeClass} shrink-0 rounded-lg border border-border bg-muted object-cover`}
      />
    )
  }

  return (
    <div className={`${sizeClass} flex shrink-0 items-center justify-center rounded-lg border border-border bg-muted font-mono text-xs font-semibold text-brand`}>
      {initials}
    </div>
  )
}

export function QrStudentSummary({ reading }: { reading: QrBiometricReading }) {
  if (!reading.studentInfo) return <span className="font-mono text-xs text-muted-foreground">QR payload stored securely</span>

  return (
    <div className="flex min-w-0 items-center gap-3 sm:min-w-[280px]">
      <QrStudentAvatar reading={reading} />
      <div className="min-w-0 space-y-1">
        <p className="truncate font-semibold text-foreground">{qrStudentDisplayName(reading)}</p>
        <p className="truncate text-xs text-muted-foreground">{[reading.studentInfo.enrollmentNo, reading.studentInfo.year, reading.studentInfo.emailId].filter(Boolean).join(" | ")}</p>
      </div>
    </div>
  )
}

export function QrStudentFieldGrid({ reading }: { reading: QrBiometricReading }) {
  const info = reading.studentInfo

  if (!info) {
    if (reading.studentInfoStatus === "failed") {
      return (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-warning-border bg-warning-surface p-3 text-xs text-warning">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          <span>Student profile scrape failed: {reading.studentInfoError ?? "Profile data was not readable"}</span>
        </div>
      )
    }
    return null
  }

  const fields = [
    ["Enrollment", info.enrollmentNo],
    ["Full Name", info.fullName],
    ["Email", info.emailId],
    ["Year", info.year],
    ["Mobile", info.mobileNo],
    ["Father", info.fatherName],
    ["Father Mobile", info.fatherMobileNo],
    ["Blood Group", info.bloodGroup],
    ["Bhawan", info.bhawan],
    ["Room", info.roomNo],
    ["Address", info.address],
    ["City", info.city],
    ["State", info.state],
    ["Pincode", info.pincode],
    ["Valid Till", info.validTill],
  ].filter(([, value]) => Boolean(value))

  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
      {fields.map(([label, value]) => (
        <div key={label} className="tile p-3">
          <p className="text-[0.78rem] text-muted-foreground">{label}</p>
          <p className="break-words font-mono text-[0.86rem] text-foreground">{value}</p>
        </div>
      ))}
    </div>
  )
}

export function QrStudentInfoPanel({ reading }: { reading: QrBiometricReading }) {
  const info = reading.studentInfo

  if (!info) return <QrStudentFieldGrid reading={reading} />

  return (
    <div className="mt-4 tile p-4">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          <QrStudentAvatar reading={reading} size="lg" />
          <div className="min-w-0">
            <p className="break-words text-sm font-bold text-foreground">{qrStudentDisplayName(reading)}</p>
            <p className="break-words text-xs font-semibold text-muted-foreground">Enrollment: {info.enrollmentNo ?? "--"}</p>
            <p className="text-xs text-muted-foreground">Scraped DOSW StudentProxy profile</p>
            <QrDecodedPayloadLink reading={reading} className="mt-2 text-[11px]" />
          </div>
        </div>
        <QrEntryStateBadge state={reading.entryState} />
      </div>
      <QrStudentFieldGrid reading={reading} />
    </div>
  )
}

export function QrScanDetailsDialog({ reading }: { reading: QrBiometricReading }) {
  const stateLabel = `${reading.entryState} time`

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Eye className="size-3.5" />
          View
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-6xl bg-card">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2 text-base">
            QR Student Scan Details
            <QrEntryStateBadge state={reading.entryState} />
          </DialogTitle>
          <DialogDescription>Full student profile, decoded link, device, and {reading.entryState} timestamp for this QR log.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="tile p-3">
            <p className="text-[0.78rem] text-muted-foreground">Device</p>
            <p className="mt-1 font-mono text-[0.86rem] text-foreground">{reading.deviceId}</p>
          </div>
          <div className="tile p-3">
            <p className="text-[0.78rem] text-muted-foreground">{stateLabel}</p>
            <p className="mt-1 font-mono text-[0.86rem] text-foreground">{formatQrFullTimestamp(reading.timestamp)}</p>
          </div>
          <div className="tile p-3">
            <p className="text-[0.78rem] text-muted-foreground">Characters</p>
            <p className="mt-1 font-mono text-[0.86rem] text-foreground">{reading.characterCount}</p>
          </div>
        </div>
        <QrStudentInfoPanel reading={reading} />
        {!reading.studentInfo && (
          <div className="tile p-3">
            <p className="mb-2 text-[0.78rem] text-muted-foreground">Decoded QR Link</p>
            <QrDecodedPayloadLink reading={reading} />
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
