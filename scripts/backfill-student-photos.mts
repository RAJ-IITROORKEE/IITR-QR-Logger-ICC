import { PrismaClient } from "@prisma/client"
import type { Prisma } from "@prisma/client"

import { fetchAndStoreStudentPhoto } from "../lib/qr-biometric-photo-storage.ts"
import { isStoredStudentPhotoUrl } from "../lib/qr-biometric-photo.ts"
import { addDoswStudentPhotoFallback, extractStudentInfo, isDoswStudentUrl, normalizeDecodedUrl } from "../lib/qr-biometric-student.ts"
import type { QrStudentInfo } from "../types/qr-biometric.ts"

const prisma = new PrismaClient()
const PROFILE_TIMEOUT_MS = 30000
const DEFAULT_DELAY_MS = 250
const DEFAULT_RETRIES = 2

type Options = { limit: number | null; delayMs: number; retries: number; dryRun: boolean }
type Candidate = { decodedData: string; storedInfo: QrStudentInfo | null; storedPhotoUrl: string | null }

function parseNonNegativeInt(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback
}

function parseOptions(argv: string[]): Options {
  const valueFor = (name: string) => {
    const index = argv.indexOf(name)
    return index >= 0 ? argv[index + 1] : undefined
  }
  const limitValue = valueFor("--limit")
  return {
    limit: limitValue === undefined ? null : parseNonNegativeInt(limitValue, 0),
    delayMs: parseNonNegativeInt(valueFor("--delay-ms"), DEFAULT_DELAY_MS),
    retries: parseNonNegativeInt(valueFor("--retries"), DEFAULT_RETRIES),
    dryRun: argv.includes("--dry-run"),
  }
}

function hasUsefulStudentInfo(info: QrStudentInfo): boolean {
  return Boolean(info.fullName || info.enrollmentNo || info.emailId)
}

function readStoredStudentInfo(value: Prisma.JsonValue | null): QrStudentInfo | null {
  if (!value || Array.isArray(value) || typeof value !== "object") return null
  const readString = (key: keyof QrStudentInfo) => typeof value[key] === "string" ? value[key] : undefined
  const info: QrStudentInfo = {
    enrollmentNo: readString("enrollmentNo"),
    photoUrl: readString("photoUrl"),
  }
  return addDoswStudentPhotoFallback(info)
}

async function fetchProfile(decodedData: string): Promise<{ info: QrStudentInfo; cookie?: string } | null> {
  const profileUrl = normalizeDecodedUrl(decodedData)
  if (!profileUrl || !isDoswStudentUrl(profileUrl)) return null

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), PROFILE_TIMEOUT_MS)
  try {
    const response = await fetch(profileUrl, {
      cache: "no-store",
      headers: {
        accept: "text/html,application/xhtml+xml",
        "accept-language": "en-IN,en;q=0.9",
        "user-agent": "Mozilla/5.0 (compatible; QR-Logger-ICC-Photo-Backfill/1.0)",
      },
      signal: controller.signal,
    })
    if (!response.ok) throw new Error(`profile HTTP ${response.status}`)
    const contentType = response.headers.get("content-type")?.toLowerCase() ?? ""
    if (contentType && !contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) throw new Error("profile response was not HTML")

    const cookies = typeof response.headers.getSetCookie === "function"
      ? response.headers.getSetCookie()
      : [response.headers.get("set-cookie")].filter((cookie): cookie is string => Boolean(cookie))
    const cookie = cookies.map((value) => value.split(";")[0]).join("; ") || undefined
    const info = addDoswStudentPhotoFallback(extractStudentInfo(await response.text(), profileUrl))
    if (!hasUsefulStudentInfo(info)) throw new Error("profile fields were not readable")
    return { info, cookie }
  } finally {
    clearTimeout(timeout)
  }
}

function sleep(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

async function main() {
  const options = parseOptions(process.argv.slice(2))
  const rows = await prisma.qrBiometricReading.findMany({
    orderBy: { createdAt: "desc" },
    select: { decodedData: true, studentInfo: true, studentPhotoUrl: true },
  })
  const grouped = rows.reduce((students, row) => {
    const existing = students.get(row.decodedData) ?? { decodedData: row.decodedData, storedInfo: null, storedPhotoUrl: null, complete: true }
    const info = readStoredStudentInfo(row.studentInfo)
    if (!existing.storedInfo?.photoUrl && info?.photoUrl) existing.storedInfo = info
    if (!existing.storedPhotoUrl && isStoredStudentPhotoUrl(row.studentPhotoUrl)) existing.storedPhotoUrl = row.studentPhotoUrl
    if (!isStoredStudentPhotoUrl(row.studentPhotoUrl)) existing.complete = false
    students.set(row.decodedData, existing)
    return students
  }, new Map<string, Candidate & { complete: boolean }>())
  const candidates = Array.from(grouped.values())
    .filter((candidate) => !candidate.complete)
    .sort((left, right) => Number(Boolean(right.storedPhotoUrl || right.storedInfo?.photoUrl)) - Number(Boolean(left.storedPhotoUrl || left.storedInfo?.photoUrl)))
  const selected = options.limit === null ? candidates : candidates.slice(0, options.limit)
  const stats = { candidates: selected.length, stored: 0, repaired: 0, skipped: 0, failed: 0 }
  const storedMetadataCount = selected.filter((candidate) => candidate.storedPhotoUrl || candidate.storedInfo?.photoUrl).length

  console.log(`Found ${candidates.length} unique students needing photos; processing ${selected.length} (${storedMetadataCount} with stored photo metadata).`)
  if (options.dryRun) {
    console.log("Dry run only; no DOSW requests, Blob uploads, or database updates will be made.")
    return
  }

  for (const [index, { decodedData, storedInfo, storedPhotoUrl: existingPhotoUrl }] of selected.entries()) {
    let lastError = "unknown error"
    let completed = false
    let skipped = false
    let uploadedPhotoUrl: string | null = null
    for (let attempt = 0; attempt <= options.retries; attempt++) {
      try {
        let storedPhotoUrl = existingPhotoUrl ?? uploadedPhotoUrl
        if (!storedPhotoUrl) {
          const profile = storedInfo?.photoUrl ? { info: storedInfo } : await fetchProfile(decodedData)
          if (!profile?.info.photoUrl) {
            skipped = true
            stats.skipped++
            console.log(`[${index + 1}/${selected.length}] skipped: no usable photo URL`)
            break
          }
          uploadedPhotoUrl = await fetchAndStoreStudentPhoto(decodedData, profile.info.photoUrl, profile.cookie, decodedData)
          storedPhotoUrl = uploadedPhotoUrl
          if (!storedPhotoUrl) {
            skipped = true
            stats.skipped++
            console.log(`[${index + 1}/${selected.length}] skipped: photo URL was not valid for DOSW`)
            break
          }
        }
        await prisma.qrBiometricReading.updateMany({ where: { decodedData }, data: { studentPhotoUrl: storedPhotoUrl } })
        completed = true
        if (existingPhotoUrl) {
          stats.repaired++
          console.log(`[${index + 1}/${selected.length}] repaired stored photo references`)
        } else {
          stats.stored++
          console.log(`[${index + 1}/${selected.length}] stored photo`)
        }
        break
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error)
        if (attempt < options.retries) await sleep(Math.max(options.delayMs, 500) * (attempt + 1))
      }
    }
    if (!completed && !skipped) {
      stats.failed++
      console.error(`[${index + 1}/${selected.length}] failed: ${lastError}`)
    }
    if (index < selected.length - 1 && options.delayMs > 0) await sleep(options.delayMs)
  }

  console.log(`Backfill complete: ${stats.stored} stored, ${stats.repaired} repaired, ${stats.skipped} skipped, ${stats.failed} failed.`)
  if (stats.failed + stats.skipped > 0) process.exitCode = 1
}

main().catch((error) => {
  console.error("Photo backfill aborted:", error instanceof Error ? error.message : error)
  process.exitCode = 1
}).finally(() => prisma.$disconnect())
