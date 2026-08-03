import { PrismaClient } from "@prisma/client"

import { normalizeEnrollmentKey } from "../lib/attendance-device-contract.ts"
import { publishLatestAttendanceSnapshot, recordCanonicalQrAttendance } from "../lib/attendance-ledger.ts"
import { isDoswStudentUrl, normalizeDecodedUrl } from "../lib/qr-biometric-student.ts"
import type { QrStudentInfo } from "../types/qr-biometric.ts"

const prisma = new PrismaClient()

function hasFlag(name: string) {
  return process.argv.includes(name)
}

function readLimit() {
  const argument = process.argv.find((value) => value.startsWith("--limit="))
  if (!argument) return Number.MAX_SAFE_INTEGER
  const parsed = Number.parseInt(argument.slice("--limit=".length), 10)
  if (!Number.isSafeInteger(parsed) || parsed < 1) throw new Error("--limit must be a positive integer")
  return parsed
}

function normalizeStudentInfo(value: unknown): QrStudentInfo | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  const info: QrStudentInfo = {}
  for (const [key, raw] of Object.entries(value)) {
    if (typeof raw === "string" && raw.trim()) info[key] = raw.trim()
  }
  return info.enrollmentNo ? info : null
}

async function main() {
  const dryRun = hasFlag("--dry-run")
  const limit = readLimit()
  const rows = await prisma.qrBiometricReading.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      deviceId: true,
      decodedData: true,
      entryState: true,
      studentInfo: true,
      studentPhotoUrl: true,
      createdAt: true,
    },
  })

  const enrollmentMappings = new Map<string, string>()
  const urlMappings = new Map<string, string>()
  const candidates = []
  let missingProfile = 0
  let mappingConflicts = 0

  for (const row of rows) {
    const studentInfo = normalizeStudentInfo(row.studentInfo)
    const enrollmentKey = normalizeEnrollmentKey(studentInfo?.enrollmentNo)
    const doswUrl = normalizeDecodedUrl(row.decodedData)
    if (!studentInfo || !enrollmentKey || !doswUrl || !isDoswStudentUrl(doswUrl)) {
      missingProfile++
      continue
    }
    if ((enrollmentMappings.has(enrollmentKey) && enrollmentMappings.get(enrollmentKey) !== doswUrl)
      || (urlMappings.has(doswUrl) && urlMappings.get(doswUrl) !== enrollmentKey)) {
      mappingConflicts++
      continue
    }
    enrollmentMappings.set(enrollmentKey, doswUrl)
    urlMappings.set(doswUrl, enrollmentKey)
    candidates.push({ ...row, studentInfo })
  }

  console.log(JSON.stringify({
    dryRun,
    totalReadings: rows.length,
    eligibleReadings: candidates.length,
    uniqueIdentities: enrollmentMappings.size,
    missingProfile,
    mappingConflicts,
    selectedReadings: Math.min(candidates.length, limit),
  }, null, 2))
  if (mappingConflicts > 0) throw new Error("Identity conflicts found; review mappings before writing canonical attendance")
  if (dryRun) return

  await prisma.$runCommandRaw({
    update: "Device",
    updates: [
      { q: { deviceKind: { $exists: false } }, u: { $set: { deviceKind: "QR_SCANNER" } }, multi: true },
      { q: { enabled: { $exists: false } }, u: { $set: { enabled: true } }, multi: true },
      { q: { apiVersion: { $exists: false } }, u: { $set: { apiVersion: 1 } }, multi: true },
    ],
  })

  const stats = new Map<string, number>()
  const selectedCandidates = candidates.slice(0, limit)
  const existingEventIds = new Set((await prisma.attendanceEvent.findMany({ select: { eventId: true } })).map((event) => event.eventId))
  const pendingCandidates = selectedCandidates.filter((row) => !existingEventIds.has(row.deviceId === "MANUAL" ? `legacy:${row.id}` : `qr:${row.id}`))
  if (selectedCandidates.length > pendingCandidates.length) stats.set("ALREADY_PRESENT", selectedCandidates.length - pendingCandidates.length)

  for (const [index, row] of pendingCandidates.entries()) {
    const manual = row.deviceId === "MANUAL"
    const result = await recordCanonicalQrAttendance({
      readingId: row.id,
      sourceDeviceId: row.deviceId,
      decodedData: row.decodedData,
      occurredAt: row.createdAt,
      studentInfo: row.studentInfo,
      studentPhotoUrl: row.studentPhotoUrl,
    }, {
      eventId: manual ? `legacy:${row.id}` : `qr:${row.id}`,
      sourceType: manual ? "LEGACY" : "QR",
      intent: manual ? row.entryState === "OUT" ? "MANUAL_SET_OUT" : "MANUAL_SET_IN" : "QR_TOGGLE",
      emitChange: false,
    })
    stats.set(result.status, (stats.get(result.status) ?? 0) + 1)
    if ((index + 1) % 50 === 0 || index + 1 === pendingCandidates.length) {
      console.log(`Processed ${index + 1}/${pendingCandidates.length} remaining readings`)
    }
  }
  const publishedSnapshot = pendingCandidates.length > 0 || await prisma.attendanceChange.count() === 0
    ? await publishLatestAttendanceSnapshot()
    : false
  const [identityCount, eventCount, projectionCount, changeCount, latestProjection, latestEvent] = await Promise.all([
    prisma.studentIdentity.count(),
    prisma.attendanceEvent.count(),
    prisma.attendanceProjection.count(),
    prisma.attendanceChange.count(),
    prisma.attendanceProjection.findFirst({ orderBy: { latestOccurredAt: "desc" }, select: { latestEffectiveEventId: true, studentIdentityId: true } }),
    prisma.attendanceEvent.findFirst({ orderBy: { occurredAt: "desc" }, select: { studentIdentityId: true, status: true, effectiveState: true } }),
  ])
  console.log(JSON.stringify({
    statuses: Object.fromEntries(stats),
    publishedSnapshot,
    totals: { identityCount, eventCount, projectionCount, changeCount },
    latestProjectionReady: Boolean(latestProjection?.latestEffectiveEventId && latestProjection.studentIdentityId),
    latestEvent: { hasIdentity: Boolean(latestEvent?.studentIdentityId), status: latestEvent?.status ?? null, effectiveState: latestEvent?.effectiveState ?? null },
  }, null, 2))
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
}).finally(() => prisma.$disconnect())
