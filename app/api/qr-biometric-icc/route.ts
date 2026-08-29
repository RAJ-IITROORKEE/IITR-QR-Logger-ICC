import { NextRequest, NextResponse } from "next/server"
import { after } from "next/server"

import { ACCESS_SESSION_COOKIE, ADMIN_ACCESS_ROLES, verifyAccessSession } from "@/lib/access-auth"
import { ADMIN_SESSION_COOKIE, verifyAdminSession } from "@/lib/admin-auth"
import { deleteCanonicalAttendanceReadings, reconcilePendingCanonicalReadings, recordCanonicalQrAttendance, updateCanonicalStudentPhoto } from "@/lib/attendance-ledger"
import { resolveDeviceMacRegistration } from "@/lib/device-mac-registration"
import { verifyDeviceApiKey } from "@/lib/device-api-key"
import { matchesScanDelivery, resolveScanId } from "@/lib/qr-biometric-delivery"
import { matchesDeletionScope } from "@/lib/qr-biometric-deletion"
import { enrichWithKnownStudentProfiles } from "@/lib/qr-biometric-profile"
import { isStoredStudentPhotoUrl } from "@/lib/qr-biometric-photo"
import { fetchAndStoreStudentPhoto } from "@/lib/qr-biometric-photo-storage"
import { isSameReportingDay, isSameReportingMonth, parseReportingDateBoundary, parseReportingMonthRange, QR_REPORTING_TIME_ZONE, reportingDateKey } from "@/lib/qr-biometric-reporting"
import { addDoswStudentPhotoFallback, extractStudentInfo, isDoswStudentUrl, normalizeDecodedUrl } from "@/lib/qr-biometric-student"
import { prisma } from "@/lib/prisma"
import type { QrBiometricReading, QrBiometricStudentSummary, QrEntryState, QrStudentInfo, QrStudentInfoStatus } from "@/types/qr-biometric"

export const dynamic = "force-dynamic"
export const revalidate = 0

const DEFAULT_LIMIT = 20
const MAX_LIMIT = 200
const PUBLIC_LOG_LIMIT = 100
const MAX_FETCH_LIMIT = 5000
const MAX_BUFFER_SIZE = 500
const MAX_PENDING_QUEUE = 500
const DELETE_BATCH_SIZE = 100
const DEVICE_HISTORY_LIMIT = 5000
const ONLINE_SECONDS = 35
const STUDENT_PROFILE_TIMEOUT_MS = 8000
const EXPECTED_QR_PATTERN = "https://dosw.iitr.ac.in/StudentProxy.aspx?id=..."
const RECEIVER_ENDPOINT = "/api/qr-biometric-icc"
const MANUAL_DEVICE_ID = "MANUAL"

type CanonicalSnapshot = {
  event?: {
    eventId?: unknown
    occurredAt?: unknown
    entryState?: unknown
    sourceType?: unknown
    status?: unknown
  } | null
  student?: {
    identityId?: unknown
    name?: unknown
    enrollment?: unknown
  } | null
}

type DbSaveStatus = "saved" | "queued"
type SortKey = "createdAt" | "deviceId" | "entryState" | "scanStatus" | "characterCount"
type SortOrder = "asc" | "desc"
type AuthenticatedDevice = {
  id: string
  deviceNumber: string
  apiKeyHash: string | null
  macAddress: string | null
  macAddressLockedAt: Date | null
  deviceKind: string
  enabled: boolean
  disabledAt: Date | null
}
type DeviceAuthResult = { ok: true; error: null; device: AuthenticatedDevice } | { ok: false; error: string }
type StudentProfileFetch = { status: QrStudentInfoStatus; info: QrStudentInfo | null; error: string | null; studentPhotoUrl?: string; photoCookie?: string; profileUrl?: string }

const liveReadingsBuffer: QrBiometricReading[] = []
const pendingWriteQueue: QrBiometricReading[] = []

async function hasDashboardAccess(request: NextRequest) {
  if (verifyAdminSession(request.cookies.get(ADMIN_SESSION_COOKIE)?.value)) return true
  return verifyAccessSession(request.cookies.get(ACCESS_SESSION_COOKIE)?.value)
}

async function hasAdminReadAccess(request: NextRequest) {
  if (verifyAdminSession(request.cookies.get(ADMIN_SESSION_COOKIE)?.value)) return true
  return verifyAccessSession(request.cookies.get(ACCESS_SESSION_COOKIE)?.value, ADMIN_ACCESS_ROLES)
}

function parseText(value: unknown): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed || null
}

function parseDecodedData(body: Record<string, unknown> | null): string | null {
  if (!body) return null
  return parseText(body.decodedData) ?? parseText(body.qrData) ?? parseText(body.data)
}

function parseApiKey(body: Record<string, unknown> | null, request: NextRequest): string | null {
  return parseText(body?.apiKey) ?? parseText(request.headers.get("x-api-key"))
}

function parseDeviceMacAddress(body: Record<string, unknown> | null): string | null {
  return parseText(body?.macAddress) ?? parseText(body?.deviceMac) ?? parseText(body?.mac)
}

function isDeviceOnlineEvent(body: Record<string, unknown> | null) {
  const event = parseText(body?.event) ?? parseText(body?.action) ?? parseText(body?.type)
  return event === "device-online" || event === "device-connected" || event === "wifi-connected"
}

function parsePositiveInt(value: string | null, fallback: number, max: number): number {
  if (!value) return fallback
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed) || parsed < 1) return fallback
  return Math.min(parsed, max)
}

function parseSort(value: string | null): SortKey {
  if (value === "deviceId" || value === "entryState" || value === "scanStatus" || value === "characterCount") return value
  return "createdAt"
}

function parseOrder(value: string | null): SortOrder {
  return value === "asc" ? "asc" : "desc"
}

function normalizeEntryState(value: unknown): QrEntryState {
  return value === "OUT" ? "OUT" : "IN"
}

function nextEntryState(state: QrEntryState): QrEntryState {
  return state === "IN" ? "OUT" : "IN"
}

function hasUsefulStudentInfo(info: QrStudentInfo): boolean {
  return Boolean(info.fullName || info.enrollmentNo || info.emailId)
}

function normalizeStudentInfo(value: unknown): QrStudentInfo | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  const normalized: QrStudentInfo = {}
  for (const [key, raw] of Object.entries(value)) {
    if (typeof raw === "string" && raw.trim()) normalized[key] = raw.trim()
  }
  return Object.keys(normalized).length > 0 ? addDoswStudentPhotoFallback(normalized) : null
}

function toStoredStudentInfo(info: QrStudentInfo | null): Record<string, string> | undefined {
  if (!info) return undefined
  const stored: Record<string, string> = {}
  for (const [key, value] of Object.entries(info)) {
    if (typeof value === "string" && value.trim()) stored[key] = value.trim()
  }
  return Object.keys(stored).length > 0 ? stored : undefined
}

async function fetchStudentInfo(decodedData: string): Promise<StudentProfileFetch> {
  const profileUrl = normalizeDecodedUrl(decodedData)
  if (!profileUrl || !isDoswStudentUrl(profileUrl)) return { status: "not_applicable", info: null, error: null }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), STUDENT_PROFILE_TIMEOUT_MS)

  try {
    const response = await fetch(profileUrl, {
      cache: "no-store",
      headers: {
        accept: "text/html,application/xhtml+xml",
        "accept-language": "en-IN,en;q=0.9",
        "user-agent": "Mozilla/5.0 (compatible; QR-Logger-ICC/1.0)",
      },
      signal: controller.signal,
    })
    if (!response.ok) return { status: "failed", info: null, error: `Student profile returned HTTP ${response.status}` }
    const contentType = response.headers.get("content-type")?.toLowerCase() ?? ""
    if (contentType && !contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) {
      return { status: "failed", info: null, error: "Student profile response was not HTML" }
    }

    const cookies = typeof response.headers.getSetCookie === "function"
      ? response.headers.getSetCookie()
      : [response.headers.get("set-cookie")].filter((cookie): cookie is string => Boolean(cookie))
    const photoCookie = cookies.map((cookie) => cookie.split(";")[0]).join("; ") || undefined
    const info = extractStudentInfo(await response.text(), profileUrl)
    if (!hasUsefulStudentInfo(info)) return { status: "failed", info: null, error: "Student profile did not contain readable fields" }
    return { status: "scraped", info, error: null, photoCookie, profileUrl }
  } catch (error) {
    return { status: "failed", info: null, error: error instanceof Error ? error.message : "Failed to scrape student profile" }
  } finally {
    clearTimeout(timeout)
  }
}

async function reuseStoredStudentInfo(decodedData: string, profile: StudentProfileFetch): Promise<StudentProfileFetch> {
  try {
    const [storedProfile, storedPhoto] = await Promise.all([
      profile.info ? null : prisma.qrBiometricReading.findFirst({
        where: { decodedData, studentInfoStatus: "scraped" },
        orderBy: { createdAt: "desc" },
        select: { studentInfo: true },
      }),
      prisma.qrBiometricReading.findFirst({
        where: { decodedData, studentPhotoUrl: { not: null } },
        orderBy: { createdAt: "desc" },
        select: { studentPhotoUrl: true },
      }),
    ])
    const storedInfo = normalizeStudentInfo(storedProfile?.studentInfo)
    return {
      ...profile,
      info: profile.info ?? (storedInfo && hasUsefulStudentInfo(storedInfo) ? storedInfo : null),
      studentPhotoUrl: isStoredStudentPhotoUrl(storedPhoto?.studentPhotoUrl) ? storedPhoto.studentPhotoUrl : undefined,
    }
  } catch (error) {
    console.error("[qr-biometric] Failed to reuse stored student profile", error)
    return profile
  }
}

async function resolveStudentProfile(decodedData: string) {
  const empty: StudentProfileFetch = { status: "not_applicable", info: null, error: null }
  const stored = await reuseStoredStudentInfo(decodedData, empty)
  if (stored.info?.enrollmentNo) return { profile: { ...stored, status: "scraped" as const, error: null }, fetched: null }

  const fetched = await fetchStudentInfo(decodedData)
  return { profile: await reuseStoredStudentInfo(decodedData, fetched), fetched }
}

async function resolveEntryState(decodedData: string): Promise<QrEntryState> {
  const latestMemoryReading = [...liveReadingsBuffer, ...pendingWriteQueue]
    .filter((reading) => reading.decodedData === decodedData)
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0]

  try {
    const latest = await prisma.qrBiometricReading.findFirst({
      where: { decodedData },
      orderBy: { createdAt: "desc" },
      select: { entryState: true, createdAt: true },
    })

    if (!latest && !latestMemoryReading) return "IN"
    const memoryIsNewer = Boolean(latestMemoryReading && (!latest || new Date(latestMemoryReading.timestamp) > latest.createdAt))
    const latestState = memoryIsNewer ? latestMemoryReading!.entryState : normalizeEntryState(latest?.entryState)
    return latestState === "IN" ? "OUT" : "IN"
  } catch (error) {
    console.error("[qr-biometric] Failed to resolve entry state", error)
    return latestMemoryReading ? (latestMemoryReading.entryState === "IN" ? "OUT" : "IN") : "IN"
  }
}

async function authenticateDevice(deviceId: string, apiKey: string | null): Promise<DeviceAuthResult> {
  if (!apiKey) return { ok: false, error: "Missing API key. Paste the generated API_KEY into the Arduino code." }

  const device = await prisma.device.findFirst({
    where: { deviceNumber: deviceId, projectType: "qr-biometric" },
    select: { id: true, deviceNumber: true, apiKeyHash: true, macAddress: true, macAddressLockedAt: true, deviceKind: true, enabled: true, disabledAt: true },
  })
  if (!device || !verifyDeviceApiKey(apiKey, device.apiKeyHash)) return { ok: false, error: "Invalid device ID or API key" }
  if (!device.enabled || device.disabledAt || device.deviceKind !== "QR_SCANNER") return { ok: false, error: "Invalid device ID or API key" }

  await prisma.device.update({ where: { id: device.id }, data: { apiKeyLastUsedAt: new Date() } })
  return { ok: true, error: null, device }
}

async function saveDeviceMacRegistration(device: AuthenticatedDevice, rawMacAddress: string) {
  const result = resolveDeviceMacRegistration(device, rawMacAddress)
  if (!result.ok) return result

  if (result.status === "registered") {
    const existingDevice = await prisma.device.findFirst({
      where: { projectType: "qr-biometric", macAddress: result.macAddress, NOT: { id: device.id } },
      select: { deviceNumber: true },
    })
    if (existingDevice) {
      return {
        ok: false as const,
        status: "conflict" as const,
        error: `Device MAC is already locked to ${existingDevice.deviceNumber}`,
        macAddress: result.macAddress,
        lockedMacAddress: result.macAddress,
      }
    }
  }

  await prisma.device.update({ where: { id: device.id }, data: result.updateData })
  return result
}

function pushWithLimit(buffer: QrBiometricReading[], reading: QrBiometricReading, maxSize: number) {
  buffer.unshift(reading)
  if (buffer.length > maxSize) buffer.length = maxSize
}

function removeReadingFromBuffer(buffer: QrBiometricReading[], id: string) {
  const retained = buffer.filter((reading) => reading.id !== id)
  buffer.length = 0
  buffer.push(...retained)
}

function replaceBufferedReading(reading: QrBiometricReading) {
  removeReadingFromBuffer(liveReadingsBuffer, reading.id)
  pushWithLimit(liveReadingsBuffer, reading, MAX_BUFFER_SIZE)
}

function applyStoredPhotoToMemory(decodedData: string, studentPhotoUrl: string) {
  for (const reading of [...liveReadingsBuffer, ...pendingWriteQueue]) {
    if (reading.decodedData === decodedData) reading.studentPhotoUrl = studentPhotoUrl
  }
}

function createReading(deviceId: string, decodedData: string, entryState: QrEntryState, studentProfile: { status: QrStudentInfoStatus; info: QrStudentInfo | null; error: string | null; studentPhotoUrl?: string }, id = crypto.randomUUID()): QrBiometricReading {
  return {
    id,
    deviceId,
    decodedData,
    decodedUrl: normalizeDecodedUrl(decodedData),
    scanStatus: "success",
    entryState,
    characterCount: decodedData.length,
    studentInfo: studentProfile.info,
    studentPhotoUrl: studentProfile.studentPhotoUrl ?? null,
    studentInfoStatus: studentProfile.status,
    studentInfoError: studentProfile.error,
    timestamp: new Date().toISOString(),
  }
}

function toApiReading(record: {
  id: string
  deviceId: string
  decodedData: string
  scanStatus: string
  entryState?: string | null
  characterCount: number
  studentInfo?: unknown
  studentPhotoUrl?: string | null
  studentInfoStatus?: string | null
  studentInfoError?: string | null
  createdAt: Date
}): QrBiometricReading {
  const status = record.studentInfoStatus
  return {
    id: record.id,
    deviceId: record.deviceId,
    decodedData: record.decodedData,
    decodedUrl: normalizeDecodedUrl(record.decodedData),
    scanStatus: record.scanStatus,
    entryState: normalizeEntryState(record.entryState),
    characterCount: record.characterCount,
    studentInfo: normalizeStudentInfo(record.studentInfo),
    studentPhotoUrl: isStoredStudentPhotoUrl(record.studentPhotoUrl) ? record.studentPhotoUrl : null,
    studentInfoStatus: status === "scraped" || status === "failed" ? status : "not_applicable",
    studentInfoError: record.studentInfoError ?? null,
    timestamp: record.createdAt.toISOString(),
  }
}

async function latestCanonicalReading(): Promise<QrBiometricReading | null> {
  const change = await prisma.attendanceChange.findFirst({
    where: { audienceDeviceId: null, kind: "LATEST_SNAPSHOT" },
    orderBy: { sequence: "desc" },
    select: { snapshot: true, createdAt: true },
  })
  if (!change || !change.snapshot || typeof change.snapshot !== "object") return null

  const snapshot = change.snapshot as CanonicalSnapshot
  const event = snapshot.event
  const student = snapshot.student
  const eventId = typeof event?.eventId === "string" ? event.eventId : ""
  const enrollment = typeof student?.enrollment === "string" ? student.enrollment : ""
  if (!eventId || !enrollment) return null

  const identityId = typeof student?.identityId === "string" ? student.identityId : null
  const identity = identityId
    ? await prisma.studentIdentity.findUnique({
        where: { id: identityId },
        select: { studentPhotoUrl: true },
      })
    : null
  const sourceType = typeof event?.sourceType === "string" ? event.sourceType : "CANONICAL"
  const name = typeof student?.name === "string" ? student.name : null
  const occurredAt = typeof event?.occurredAt === "string" ? event.occurredAt : change.createdAt.toISOString()
  return {
    id: eventId,
    deviceId: sourceType === "TAB5_MANUAL" || sourceType === "LEGACY" ? MANUAL_DEVICE_ID : sourceType,
    decodedData: `canonical:${enrollment}`,
    decodedUrl: null,
    scanStatus: typeof event?.status === "string" ? event.status : "success",
    entryState: normalizeEntryState(event?.entryState),
    characterCount: enrollment.length,
    studentInfo: { enrollmentNo: enrollment, ...(name ? { fullName: name } : {}) },
    studentPhotoUrl: isStoredStudentPhotoUrl(identity?.studentPhotoUrl) ? identity?.studentPhotoUrl ?? null : null,
    studentInfoStatus: name ? "scraped" : "not_applicable",
    studentInfoError: null,
    timestamp: occurredAt,
  }
}

function buildStats(readings: QrBiometricReading[]) {
  const totalScans = readings.length
  const uniqueCodes = new Set(readings.map((r) => r.decodedData)).size
  const uniqueDevices = new Set(readings.map((r) => r.deviceId)).size
  const totalChars = readings.reduce((sum, r) => sum + r.characterCount, 0)
  const latestStateByCode = new Map<string, QrEntryState>()

  for (const reading of readings) {
    if (!latestStateByCode.has(reading.decodedData)) latestStateByCode.set(reading.decodedData, reading.entryState)
  }

  return {
    totalScans,
    uniqueCodes,
    uniqueDevices,
    currentIn: Array.from(latestStateByCode.values()).filter((state) => state === "IN").length,
    currentOut: Array.from(latestStateByCode.values()).filter((state) => state === "OUT").length,
    scrapedStudents: readings.filter((r) => r.studentInfoStatus === "scraped").length,
    dailyScans: readings.filter((r) => isSameReportingDay(new Date(r.timestamp))).length,
    dailyIn: readings.filter((r) => isSameReportingDay(new Date(r.timestamp)) && r.entryState === "IN").length,
    dailyOut: readings.filter((r) => isSameReportingDay(new Date(r.timestamp)) && r.entryState === "OUT").length,
    qrDeviceScans: readings.filter((r) => r.deviceId !== MANUAL_DEVICE_ID).length,
    manualScans: readings.filter((r) => r.deviceId === MANUAL_DEVICE_ID).length,
    monthlyScans: readings.filter((r) => isSameReportingMonth(new Date(r.timestamp))).length,
    lastScanAt: readings[0]?.timestamp ?? null,
    avgCharacters: totalScans > 0 ? Number((totalChars / totalScans).toFixed(1)) : null,
  }
}

function buildAnalysis(readings: QrBiometricReading[]) {
  const latest = readings[0] ?? null
  const deviceMap = new Map<string, { deviceId: string; totalScans: number; lastScanAt: string }>()
  const timeline = new Map<string, { date: string; total: number; inCount: number; outCount: number }>()

  for (const reading of readings) {
    const existingDevice = deviceMap.get(reading.deviceId)
    if (existingDevice) {
      existingDevice.totalScans += 1
      if (new Date(reading.timestamp) > new Date(existingDevice.lastScanAt)) existingDevice.lastScanAt = reading.timestamp
    } else {
      deviceMap.set(reading.deviceId, { deviceId: reading.deviceId, totalScans: 1, lastScanAt: reading.timestamp })
    }

    const date = reportingDateKey(new Date(reading.timestamp))
    const existingDay = timeline.get(date) ?? { date, total: 0, inCount: 0, outCount: 0 }
    existingDay.total += 1
    if (reading.entryState === "IN") existingDay.inCount += 1
    if (reading.entryState === "OUT") existingDay.outCount += 1
    timeline.set(date, existingDay)
  }

  return {
    ...buildStats(readings),
    latestDecodedData: latest?.decodedData ?? null,
    latestDeviceId: latest?.deviceId ?? null,
    latestStatus: latest?.scanStatus ?? null,
    latestEntryState: latest?.entryState ?? null,
    latestStudentInfo: latest?.studentInfo ?? null,
    deviceSummaries: Array.from(deviceMap.values()).sort((a, b) => new Date(b.lastScanAt).getTime() - new Date(a.lastScanAt).getTime()),
    entryTimeline: Array.from(timeline.values()).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 31),
    studentSummaries: buildStudentSummaries(readings),
  }
}

function withBestStudentProfile(target: QrBiometricReading, source: QrBiometricReading): QrBiometricReading {
  if (!source.studentInfo && !source.studentPhotoUrl) return target
  if (!target.studentInfo) {
    return { ...target, studentInfo: source.studentInfo, studentPhotoUrl: target.studentPhotoUrl ?? source.studentPhotoUrl, studentInfoStatus: source.studentInfoStatus, studentInfoError: source.studentInfoError }
  }
  if (target.studentPhotoUrl || !source.studentPhotoUrl) {
    if (target.studentInfo.photoUrl || !source.studentInfo?.photoUrl) return target
  }

  return {
    ...target,
    studentPhotoUrl: target.studentPhotoUrl ?? source.studentPhotoUrl,
    studentInfo: source.studentInfo?.photoUrl
      ? { ...source.studentInfo, ...target.studentInfo, photoUrl: target.studentInfo.photoUrl ?? source.studentInfo.photoUrl }
      : target.studentInfo,
  }
}

function buildStudentSummaries(readings: QrBiometricReading[]): QrBiometricStudentSummary[] {
  const students = new Map<string, QrBiometricStudentSummary>()

  for (const reading of readings) {
    const enrollment = normalizeEnrollment(reading.studentInfo?.enrollmentNo ?? null)
    const key = enrollment || reading.decodedUrl || reading.decodedData
    const existing = students.get(key)

    if (existing) {
      existing.totalLogs += 1
      existing.inCount += reading.entryState === "IN" ? 1 : 0
      existing.outCount += reading.entryState === "OUT" ? 1 : 0
      existing.logs.push(reading)
      if (new Date(reading.timestamp) < new Date(existing.firstSeenAt)) existing.firstSeenAt = reading.timestamp
      if (!existing.enrollmentNo && reading.studentInfo?.enrollmentNo) existing.enrollmentNo = reading.studentInfo.enrollmentNo
      if (!existing.emailId && reading.studentInfo?.emailId) existing.emailId = reading.studentInfo.emailId
      if (!existing.bhawan && reading.studentInfo?.bhawan) existing.bhawan = reading.studentInfo.bhawan
      if (existing.displayName === existing.latestReading.decodedData && reading.studentInfo?.fullName) existing.displayName = reading.studentInfo.fullName
      existing.latestReading = withBestStudentProfile(existing.latestReading, reading)
      continue
    }

    const info = reading.studentInfo
    students.set(key, {
      id: key,
      displayName: info?.fullName ?? info?.enrollmentNo ?? reading.decodedData,
      enrollmentNo: info?.enrollmentNo ?? null,
      emailId: info?.emailId ?? null,
      bhawan: info?.bhawan ?? null,
      latestState: reading.entryState,
      totalLogs: 1,
      inCount: reading.entryState === "IN" ? 1 : 0,
      outCount: reading.entryState === "OUT" ? 1 : 0,
      firstSeenAt: reading.timestamp,
      lastSeenAt: reading.timestamp,
      latestReading: reading,
      logs: [reading],
    })
  }

  return Array.from(students.values()).sort((a, b) => new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime())
}

function applySearch(readings: QrBiometricReading[], search: string) {
  if (!search) return readings
  const lowered = search.toLowerCase()
  return readings.filter((r) => [r.deviceId, r.decodedData, r.scanStatus, r.entryState, r.timestamp, r.studentInfo?.fullName, r.studentInfo?.enrollmentNo, r.studentInfo?.emailId, r.studentInfo?.bhawan].join(" ").toLowerCase().includes(lowered))
}

function sortReadings(readings: QrBiometricReading[], sort: SortKey, order: SortOrder) {
  const dir = order === "asc" ? 1 : -1
  return [...readings].sort((a, b) => {
    if (sort === "createdAt") return (new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()) * dir
    if (sort === "characterCount") return (a.characterCount - b.characterCount) * dir
    return String(a[sort]).localeCompare(String(b[sort])) * dir
  })
}

function normalizeEnrollment(value: string | null) {
  return value?.replace(/\s+/g, "").toLowerCase() ?? ""
}

function findReadingByEnrollment(readings: QrBiometricReading[], enrollment: string | null) {
  const normalized = normalizeEnrollment(enrollment)
  if (!normalized) return null
  return readings.find((reading) => normalizeEnrollment(reading.studentInfo?.enrollmentNo ?? null) === normalized) ?? null
}

async function findStoredReadingByEnrollment(enrollment: string | null) {
  const normalized = normalizeEnrollment(enrollment)
  if (!normalized) return null

  const records = await prisma.qrBiometricReading.findMany({
    orderBy: { createdAt: "desc" },
    take: MAX_FETCH_LIMIT,
  })
  return findReadingByEnrollment(records.map(toApiReading), enrollment)
}

function paginateReadings(readings: QrBiometricReading[], page: number, limit: number) {
  const total = readings.length
  const totalPages = total === 0 ? 1 : Math.ceil(total / limit)
  const safePage = Math.min(page, totalPages)
  const offset = (safePage - 1) * limit
  return { page: safePage, limit, total, totalPages, hasNextPage: safePage < totalPages, hasPrevPage: safePage > 1, items: readings.slice(offset, offset + limit) }
}

async function saveReadingToDatabase(reading: QrBiometricReading, preserveReadingId = false) {
  const record = await prisma.qrBiometricReading.create({
    data: {
      ...(preserveReadingId ? { id: reading.id } : {}),
      deviceId: reading.deviceId,
      decodedData: reading.decodedData,
      scanStatus: reading.scanStatus,
      entryState: reading.entryState,
      characterCount: reading.characterCount,
      studentInfo: toStoredStudentInfo(reading.studentInfo),
      studentPhotoUrl: reading.studentPhotoUrl ?? undefined,
      studentInfoStatus: reading.studentInfoStatus,
      studentInfoError: reading.studentInfoError ?? undefined,
      createdAt: new Date(reading.timestamp),
    },
  })

  void pruneStoredReadings(reading.deviceId).catch((error) => console.error("[qr-biometric] Retention prune failed", error))
  return record
}

async function canonicalizeStoredReading(reading: QrBiometricReading, options: { sourceType?: "QR" | "LEGACY"; intent?: "QR_TOGGLE" | "MANUAL_SET_IN" | "MANUAL_SET_OUT"; eventId?: string } = {}) {
  let candidate = reading
  if (!candidate.studentInfo?.enrollmentNo) {
    const { profile } = await resolveStudentProfile(candidate.decodedData)
    if (profile.info?.enrollmentNo) {
      await prisma.qrBiometricReading.updateMany({
        where: { decodedData: candidate.decodedData, OR: [{ attendanceEventId: null }, { attendanceEventId: { isSet: false } }] },
        data: {
          studentInfo: toStoredStudentInfo(profile.info),
          studentInfoStatus: profile.status,
          studentInfoError: profile.error ?? undefined,
          studentPhotoUrl: profile.studentPhotoUrl,
        },
      })
      candidate = { ...candidate, studentInfo: profile.info, studentInfoStatus: profile.status, studentInfoError: profile.error, studentPhotoUrl: profile.studentPhotoUrl ?? candidate.studentPhotoUrl }
    }
  }
  if (!candidate.studentInfo?.enrollmentNo) return { reading: candidate, status: "PENDING_PROFILE" as const }
  const result = await recordCanonicalQrAttendance({
    readingId: candidate.id,
    sourceDeviceId: candidate.deviceId,
    decodedData: candidate.decodedData,
    occurredAt: new Date(candidate.timestamp),
    studentInfo: candidate.studentInfo,
    studentPhotoUrl: candidate.studentPhotoUrl,
  }, options)
  const entryState = result.effectiveState === "IN" || result.effectiveState === "OUT" ? result.effectiveState : candidate.entryState
  return { reading: { ...candidate, entryState }, status: result.status }
}

function scanSuccessResponse(reading: QrBiometricReading, scanId: string | null, replayed = false) {
  return NextResponse.json({
    success: true,
    module: "qr-biometric-icc",
    endpoint: RECEIVER_ENDPOINT,
    message: replayed ? "QRBiometric scan was already stored" : "QRBiometric scan received and stored",
    storage: "mongodb",
    deviceId: reading.deviceId,
    scanId,
    replayed,
    scanStatus: reading.scanStatus,
    entryState: reading.entryState,
    fullName: reading.studentInfo?.fullName ?? null,
    enrollmentNo: reading.studentInfo?.enrollmentNo ?? null,
    studentPhotoUrl: reading.studentPhotoUrl,
    studentProfile: { status: reading.studentInfoStatus, error: reading.studentInfoError },
    persistence: { status: "saved", queuedWrites: pendingWriteQueue.length },
    received: reading,
  })
}

function isDurableCanonicalAttendanceStatus(status: string) {
  return status === "APPLIED" || status === "SUPPRESSED_DUPLICATE"
}

async function pruneStoredReadings(deviceId: string) {
  const overflow = await prisma.qrBiometricReading.findMany({
    where: { deviceId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: DEVICE_HISTORY_LIMIT,
    select: { id: true },
  })
  if (overflow.length === 0) return
  await prisma.qrBiometricReading.deleteMany({ where: { id: { in: overflow.map((record) => record.id) } } })
}

async function flushPendingQueue() {
  if (pendingWriteQueue.length === 0) return { flushed: 0, remaining: 0 }
  const toFlush = [...pendingWriteQueue]
  pendingWriteQueue.length = 0
  let flushed = 0
  for (const reading of toFlush) {
    try {
      const record = await saveReadingToDatabase(reading, true)
      const savedReading = toApiReading(record)
      await canonicalizeStoredReading(savedReading, {
        sourceType: "LEGACY",
        eventId: `legacy:${savedReading.id}`,
        intent: savedReading.entryState === "IN" ? "MANUAL_SET_IN" : "MANUAL_SET_OUT",
      })
      flushed++
    } catch {
      pushWithLimit(pendingWriteQueue, reading, MAX_PENDING_QUEUE)
    }
  }
  return { flushed, remaining: pendingWriteQueue.length }
}

async function saveManualReading(sourceReading: QrBiometricReading, entryState: QrEntryState) {
  const reading = createReading(MANUAL_DEVICE_ID, sourceReading.decodedData, entryState, {
    status: sourceReading.studentInfoStatus,
    info: sourceReading.studentInfo,
    error: sourceReading.studentInfoError,
    studentPhotoUrl: sourceReading.studentPhotoUrl ?? undefined,
  }, crypto.randomUUID().replaceAll("-", "").slice(0, 24))

  await flushPendingQueue().catch(() => null)
  const record = await saveReadingToDatabase(reading, true)
  const savedReading = toApiReading(record)
  const canonical = await canonicalizeStoredReading(savedReading, {
    sourceType: "LEGACY",
    eventId: `legacy:${savedReading.id}`,
    intent: entryState === "IN" ? "MANUAL_SET_IN" : "MANUAL_SET_OUT",
  })
  replaceBufferedReading(canonical.reading)
  return { reading: canonical.reading, dbStatus: "saved" as DbSaveStatus }
}

function mergeReadings(dbReadings: QrBiometricReading[], liveReadings: QrBiometricReading[]) {
  const deduped = new Map<string, QrBiometricReading>()
  for (const reading of [...dbReadings, ...liveReadings]) {
    const key = `${reading.deviceId}|${reading.timestamp}|${reading.decodedData}`
    if (!deduped.has(key)) deduped.set(key, reading)
  }
  return Array.from(deduped.values()).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
}

function filterLiveReadings(readings: QrBiometricReading[], deviceId: string | null, from: Date | null, to: Date | null) {
  return readings.filter((reading) => {
    const timestamp = new Date(reading.timestamp)
    return (!deviceId || reading.deviceId === deviceId) && (!from || timestamp >= from) && (!to || timestamp < to)
  })
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  const manualEnrollment = parseText(body?.manualEnrollment)
  if (manualEnrollment) {
    if (!(await hasDashboardAccess(request))) {
      return NextResponse.json({ success: false, module: "qr-biometric-icc", error: "Unauthorized" }, { status: 401 })
    }

    try {
      const sourceReading = await findStoredReadingByEnrollment(manualEnrollment)
      if (!sourceReading) {
        return NextResponse.json({ success: false, module: "qr-biometric-icc", error: "No saved scan found for this enrollment. The student must scan once before manual logging." }, { status: 404 })
      }

      const requestedEntryState = body?.entryState === "IN" || body?.entryState === "OUT" ? body.entryState : nextEntryState(sourceReading.entryState)
      const { reading, dbStatus } = await saveManualReading(sourceReading, requestedEntryState)

      return NextResponse.json({
        success: true,
        module: "qr-biometric-icc",
        endpoint: RECEIVER_ENDPOINT,
        message: dbStatus === "saved" ? "Manual student entry logged and stored" : "Manual student entry logged and queued for database retry",
        storage: "hybrid-mongodb-buffer",
        manual: true,
        deviceId: reading.deviceId,
        scanStatus: reading.scanStatus,
        entryState: reading.entryState,
        previousEntryState: sourceReading.entryState,
        fullName: reading.studentInfo?.fullName ?? null,
        enrollmentNo: reading.studentInfo?.enrollmentNo ?? manualEnrollment,
        studentProfile: { status: reading.studentInfoStatus, error: reading.studentInfoError },
        persistence: { status: dbStatus, queuedWrites: pendingWriteQueue.length },
        received: reading,
      })
    } catch (error) {
      console.error("[qr-biometric] Manual logging failed", error)
      return NextResponse.json({ success: false, module: "qr-biometric-icc", error: error instanceof Error ? error.message : "Manual logging failed" }, { status: 500 })
    }
  }

  const deviceId = parseText(body?.deviceId)
  const decodedData = parseDecodedData(body)
  const apiKey = parseApiKey(body, request)
  const deviceMacAddress = parseDeviceMacAddress(body)
  const resolvedScanId = resolveScanId(body?.scanId, body?.eventId)
  const scanId = resolvedScanId.value
  const deviceOnlineEvent = isDeviceOnlineEvent(body)

  if (!deviceId) {
    return NextResponse.json({ success: false, module: "qr-biometric-icc", error: "Invalid payload. Expected { deviceId: string, apiKey: string, decodedData: string }" }, { status: 400 })
  }

  if (resolvedScanId.supplied && !scanId) {
    return NextResponse.json({ success: false, module: "qr-biometric-icc", error: "Invalid scanId. Expected exactly 24 hexadecimal characters." }, { status: 400 })
  }

  const auth = await authenticateDevice(deviceId, apiKey).catch((error) => {
    console.error("[qr-biometric] Device authentication unavailable", error)
    return null
  })
  if (!auth) {
    return NextResponse.json({ success: false, module: "qr-biometric-icc", error: "Device authentication temporarily unavailable" }, { status: 503 })
  }
  if (!auth.ok) {
    return NextResponse.json({ success: false, module: "qr-biometric-icc", error: auth.error }, { status: 401 })
  }

  if (deviceOnlineEvent || (deviceMacAddress && !decodedData)) {
    if (!deviceMacAddress) {
      return NextResponse.json({ success: false, module: "qr-biometric-icc", error: "Invalid payload. Expected macAddress for device-online event" }, { status: 400 })
    }

    const registration = await saveDeviceMacRegistration(auth.device, deviceMacAddress).catch((error) => {
      console.error("[qr-biometric] Device MAC registration unavailable", error)
      return null
    })
    if (!registration) {
      return NextResponse.json({ success: false, module: "qr-biometric-icc", error: "Device registration temporarily unavailable" }, { status: 503 })
    }
    if (!registration.ok) {
      return NextResponse.json({ success: false, module: "qr-biometric-icc", event: "device-online", deviceId, macStatus: registration.status, error: registration.error }, { status: registration.status === "conflict" ? 409 : 400 })
    }

    return NextResponse.json({
      success: true,
      module: "qr-biometric-icc",
      endpoint: RECEIVER_ENDPOINT,
      event: "device-online",
      deviceId,
      macAddress: registration.macAddress,
      macStatus: registration.status,
      locked: true,
      message: registration.status === "registered" ? "Device MAC registered and locked" : "Device MAC verified",
    })
  }

  if (!decodedData) {
    return NextResponse.json({ success: false, module: "qr-biometric-icc", error: "Invalid payload. Expected { deviceId: string, apiKey: string, decodedData: string }" }, { status: 400 })
  }

  if (scanId) {
    const deleted = await prisma.qrBiometricDeletion.findUnique({ where: { scanId } }).catch((error: unknown) => {
      console.error("[qr-biometric] Deletion tombstone lookup unavailable", error)
      return undefined
    })
    if (deleted === undefined) {
      return NextResponse.json({ success: false, module: "qr-biometric-icc", error: "Scan storage temporarily unavailable" }, { status: 503 })
    }
    if (deleted) {
      return NextResponse.json({ success: false, module: "qr-biometric-icc", scanId, scanStatus: "deleted", error: "This scan was deleted by an administrator and will not be accepted again." }, { status: 422 })
    }
  }

  if (deviceMacAddress) {
    const registration = await saveDeviceMacRegistration(auth.device, deviceMacAddress).catch((error) => {
      console.error("[qr-biometric] Device MAC verification unavailable", error)
      return null
    })
    if (!registration) {
      return NextResponse.json({ success: false, module: "qr-biometric-icc", error: "Device verification temporarily unavailable" }, { status: 503 })
    }
    if (!registration.ok) {
      return NextResponse.json({ success: false, module: "qr-biometric-icc", deviceId, macStatus: registration.status, error: registration.error }, { status: registration.status === "conflict" ? 409 : 400 })
    }
  }

  if (!isDoswStudentUrl(decodedData)) {
    return NextResponse.json({ success: false, module: "qr-biometric-icc", scanStatus: "invalid_qr", message: "INVALID QR", error: `Invalid QR. Expected ${EXPECTED_QR_PATTERN}`, expectedPattern: EXPECTED_QR_PATTERN }, { status: 422 })
  }


  if (scanId) {
    const existingRecord = await prisma.qrBiometricReading.findUnique({ where: { id: scanId } }).catch((error) => {
      console.error("[qr-biometric] Delivery replay lookup unavailable", error)
      return undefined
    })
    if (existingRecord === undefined) {
      return NextResponse.json({ success: false, module: "qr-biometric-icc", error: "Scan storage temporarily unavailable" }, { status: 503 })
    }
    if (existingRecord) {
      if (!matchesScanDelivery(existingRecord, deviceId, decodedData)) {
        return NextResponse.json({ success: false, module: "qr-biometric-icc", error: "scanId is already assigned to a different scan" }, { status: 409 })
      }
      const canonical = await canonicalizeStoredReading(toApiReading(existingRecord)).catch((error) => {
        console.error("[qr-biometric] Canonical replay repair failed", error)
        return null
      })
      if (!canonical || !isDurableCanonicalAttendanceStatus(canonical.status)) {
        return NextResponse.json({ success: false, module: "qr-biometric-icc", scanId, error: "Scan is stored but attendance processing is pending; retry with the same scanId" }, { status: 503 })
      }
      replaceBufferedReading(canonical.reading)
      return scanSuccessResponse(canonical.reading, scanId, true)
    }
  }

  const [entryState, resolvedStudentProfile] = await Promise.all([resolveEntryState(decodedData), resolveStudentProfile(decodedData)])
  const { profile: studentProfile, fetched: fetchedStudentProfile } = resolvedStudentProfile
  const reading = createReading(deviceId, decodedData, entryState, studentProfile, scanId ?? undefined)
  try {
    const record = await saveReadingToDatabase(reading, Boolean(scanId))
    const savedReading = toApiReading(record)
    const canonical = await canonicalizeStoredReading(savedReading).catch((error) => {
      console.error("[qr-biometric] Canonical attendance dual-write failed", error)
      return null
    })
    if ((!canonical || !isDurableCanonicalAttendanceStatus(canonical.status)) && scanId) {
      return NextResponse.json({ success: false, module: "qr-biometric-icc", scanId, error: "Scan is stored but attendance processing is pending; retry with the same scanId" }, { status: 503 })
    }
    replaceBufferedReading(canonical?.reading ?? savedReading)
    after(async () => {
      await reconcilePendingCanonicalReadings().catch((error) => console.error("[qr-biometric] Pending canonical reconciliation failed", error))
    })
    if (studentProfile.info?.photoUrl && !savedReading.studentPhotoUrl) {
      after(async () => {
        try {
          const storedPhotoUrl = await fetchAndStoreStudentPhoto(decodedData, studentProfile.info?.photoUrl, fetchedStudentProfile?.photoCookie, fetchedStudentProfile?.profileUrl)
          if (storedPhotoUrl) {
            await prisma.qrBiometricReading.updateMany({
              where: { decodedData },
              data: { studentPhotoUrl: storedPhotoUrl },
            })
            applyStoredPhotoToMemory(decodedData, storedPhotoUrl)
            await updateCanonicalStudentPhoto(decodedData, studentProfile.info?.enrollmentNo, storedPhotoUrl)
          }
        } catch (error) {
          console.error("[qr-biometric] Failed to persist student photo", error)
        }
      })
    }
    return scanSuccessResponse(canonical?.reading ?? savedReading, scanId)
  } catch (error) {
    if (scanId) {
      const existingRecord = await prisma.qrBiometricReading.findUnique({ where: { id: scanId } }).catch(() => null)
      if (existingRecord) {
        if (matchesScanDelivery(existingRecord, deviceId, decodedData)) {
          const canonical = await canonicalizeStoredReading(toApiReading(existingRecord)).catch(() => null)
          if (!canonical || !isDurableCanonicalAttendanceStatus(canonical.status)) {
            return NextResponse.json({ success: false, module: "qr-biometric-icc", scanId, error: "Scan is stored but attendance processing is pending; retry with the same scanId" }, { status: 503 })
          }
          replaceBufferedReading(canonical.reading)
          return scanSuccessResponse(canonical.reading, scanId, true)
        }
        return NextResponse.json({ success: false, module: "qr-biometric-icc", error: "scanId is already assigned to a different scan" }, { status: 409 })
      }
    }
    console.error("[qr-biometric] Durable scan save unavailable", error)
    return NextResponse.json({ success: false, module: "qr-biometric-icc", scanId, error: "Scan was not stored; retry with the same scanId" }, { status: 503 })
  }
}

export async function GET(request: NextRequest) {
  if (!(await hasDashboardAccess(request))) {
    return NextResponse.json({ success: false, module: "qr-biometric-icc", error: "Unauthorized" }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const adminReadAccess = await hasAdminReadAccess(request)
  const limit = parsePositiveInt(searchParams.get("limit"), DEFAULT_LIMIT, adminReadAccess ? MAX_LIMIT : PUBLIC_LOG_LIMIT)
  const page = parsePositiveInt(searchParams.get("page"), 1, Number.MAX_SAFE_INTEGER)
  const deviceId = parseText(searchParams.get("deviceId"))
  const search = parseText(searchParams.get("search")) ?? ""
  const manualEnrollment = parseText(searchParams.get("manualEnrollment"))
  const requestedSort = parseSort(searchParams.get("sort"))
  const requestedOrder = parseOrder(searchParams.get("order"))
  const sort = adminReadAccess ? requestedSort : "createdAt"
  const order = adminReadAccess ? requestedOrder : "desc"
  const month = searchParams.get("month")
  const monthRange = parseReportingMonthRange(month)
  const from = monthRange?.start ?? parseReportingDateBoundary(searchParams.get("from"), "start")
  const to = monthRange?.end ?? parseReportingDateBoundary(searchParams.get("to"), "end")

  const queueResult = await flushPendingQueue().catch(() => ({ flushed: 0, remaining: pendingWriteQueue.length }))
  const changeCounter = await prisma.attendanceFeedCounter.findUnique({ where: { id: "attendance" }, select: { value: true } }).catch(() => null)
  let dbConnected = true
  let dbReadings: QrBiometricReading[] = []

  const where: { deviceId?: string; createdAt?: { gte?: Date; lt?: Date } } = {}
  if (deviceId) where.deviceId = deviceId
  if (from || to) where.createdAt = { ...(from ? { gte: from } : {}), ...(to ? { lt: to } : {}) }

  try {
    const records = await prisma.qrBiometricReading.findMany({
      where,
      orderBy: adminReadAccess
        ? sort === "createdAt" ? { createdAt: order } : [{ [sort]: order }, { createdAt: "desc" }]
        : { createdAt: "desc" },
      take: MAX_FETCH_LIMIT,
    })
    dbReadings = records.map(toApiReading)
  } catch (error) {
    dbConnected = false
    console.error("[qr-biometric] Failed to fetch readings", error)
  }

  const liveReadings = filterLiveReadings(liveReadingsBuffer, deviceId, from, to)
  const merged = enrichWithKnownStudentProfiles(mergeReadings(dbReadings, liveReadings))
  const accessibleReadings = adminReadAccess ? merged : merged.slice(0, PUBLIC_LOG_LIMIT)
  const searched = applySearch(accessibleReadings, search)
  const sorted = sortReadings(searched, sort, order)
  const paginated = paginateReadings(sorted, page, limit)
  const analysis = buildAnalysis(accessibleReadings)
  const stats = buildStats(merged)
  const canonicalLatest = !deviceId && !search && !from && !to && !manualEnrollment
    ? await latestCanonicalReading().catch(() => null)
    : null
  const latest = canonicalLatest ?? accessibleReadings[0] ?? null
  const manualMatch = manualEnrollment
    ? (await findStoredReadingByEnrollment(manualEnrollment).catch(() => null)) ?? findReadingByEnrollment(accessibleReadings, manualEnrollment)
    : null
  const manualCurrentStatus = manualMatch?.entryState ?? null
  const manualDefaultEntryState = manualCurrentStatus ? nextEntryState(manualCurrentStatus) : null
   const lastSeenSeconds = latest ? Math.max(0, Math.floor((Date.now() - new Date(latest.timestamp).getTime()) / 1000)) : null
  return NextResponse.json({
    success: true,
    module: "qr-biometric-icc",
    endpoint: RECEIVER_ENDPOINT,
    storage: dbConnected ? "hybrid-mongodb-buffer" : "in-memory-buffer",
    expectedPayload: { deviceId: "string (e.g. QRB-001)", apiKey: "string (generated from Admin Settings)", decodedData: "string (raw QR decoded data)" },
    acceptedQrPattern: EXPECTED_QR_PATTERN,
    query: { limit, page: paginated.page, deviceId, search: search || null, sort, order, from: from?.toISOString() ?? null, to: to?.toISOString() ?? null, month },
    count: paginated.items.length,
    totalCount: searched.length,
    manualLookup: manualEnrollment ? { enrollment: manualEnrollment, found: Boolean(manualMatch), currentStatus: manualCurrentStatus, defaultEntryState: manualDefaultEntryState, reading: manualMatch } : null,
    latest,
    readings: paginated.items,
    analysis,
    stats,
    pagination: { page: paginated.page, limit: paginated.limit, total: paginated.total, totalPages: paginated.totalPages, hasNextPage: paginated.hasNextPage, hasPrevPage: paginated.hasPrevPage },
    health: { status: lastSeenSeconds !== null && lastSeenSeconds <= ONLINE_SECONDS ? "online" : "offline", lastSeenSeconds },
    system: { dbConnected, queuedWrites: pendingWriteQueue.length, flushedWrites: queueResult.flushed, liveBufferCount: liveReadingsBuffer.length },
     serverTime: new Date().toISOString(),
     changeSequence: (changeCounter?.value ?? BigInt(0)).toString(),
    reportingTimeZone: QR_REPORTING_TIME_ZONE,
    warning: dbConnected ? null : "Database currently unavailable. Serving live and buffered QR scans while queue retries continue.",
  })
}

export async function DELETE(request: NextRequest) {
  if (!verifyAdminSession(request.cookies.get(ADMIN_SESSION_COOKIE)?.value) && !(await verifyAccessSession(request.cookies.get(ACCESS_SESSION_COOKIE)?.value, ADMIN_ACCESS_ROLES))) {
    return NextResponse.json({ success: false, module: "qr-biometric-icc", error: "Unauthorized" }, { status: 401 })
  }

  const body = (await request.json().catch(() => null)) as { id?: string; clearAll?: boolean; deviceId?: string; from?: string; to?: string; month?: string } | null
  if (!body?.clearAll && !body?.id) return NextResponse.json({ success: false, error: "Missing reading id or clearAll flag" }, { status: 400 })

  try {
    if (body.clearAll) {
      const monthRange = parseReportingMonthRange(body.month ?? null)
      const from = monthRange?.start ?? parseReportingDateBoundary(body.from ?? null, "start")
      const to = monthRange?.end ?? parseReportingDateBoundary(body.to ?? null, "end")
      const where: { deviceId?: string; createdAt?: { gte?: Date; lt?: Date } } = {}
      if (body.deviceId) where.deviceId = body.deviceId
      if (from || to) where.createdAt = { ...(from ? { gte: from } : {}), ...(to ? { lt: to } : {}) }
      const records = await prisma.qrBiometricReading.findMany({
        where,
        select: { id: true, deviceId: true, decodedData: true, createdAt: true },
        take: DELETE_BATCH_SIZE,
      })
      const databaseIdSet = new Set(records.map((record) => record.id))
      const memoryRecords = [...liveReadingsBuffer, ...pendingWriteQueue]
        .filter((reading) => matchesDeletionScope(reading, { deviceId: body.deviceId ?? null, from, to }))
        .filter((reading) => !databaseIdSet.has(reading.id))
        .slice(0, Math.max(0, DELETE_BATCH_SIZE - records.length))
        .map((reading) => ({ id: reading.id, deviceId: reading.deviceId, decodedData: reading.decodedData, createdAt: new Date(reading.timestamp) }))
      const allRecords = new Map([...records, ...memoryRecords].map((record) => [record.id, record]))
      const databaseIds = records.map((record) => record.id)
      for (const record of allRecords.values()) {
        if (databaseIdSet.has(record.id)) continue
        await prisma.qrBiometricDeletion.upsert({
          where: { scanId: record.id },
          create: { scanId: record.id, deviceId: record.deviceId, decodedData: record.decodedData },
          update: {},
        })
      }
      const result = await deleteCanonicalAttendanceReadings(databaseIds, "Raw attendance reading deleted by administrator")
      for (const record of allRecords.values()) {
        removeReadingFromBuffer(liveReadingsBuffer, record.id)
        removeReadingFromBuffer(pendingWriteQueue, record.id)
      }
      const [remainingDatabaseRecord, remainingMemoryRecord] = await Promise.all([
        prisma.qrBiometricReading.findFirst({ where, select: { id: true } }),
        Promise.resolve([...liveReadingsBuffer, ...pendingWriteQueue].some((reading) => matchesDeletionScope(reading, { deviceId: body.deviceId ?? null, from, to }))),
      ])
      return NextResponse.json({
        success: true,
        module: "qr-biometric-icc",
        deletedCount: allRecords.size,
        databaseDeletedCount: result.deletedReadings,
        hasMore: Boolean(remainingDatabaseRecord || remainingMemoryRecord),
      })
    }

    const id = parseText(body.id)
    if (!id) return NextResponse.json({ success: false, error: "Invalid reading id" }, { status: 400 })
    const record = await prisma.qrBiometricReading.findUnique({ where: { id }, select: { id: true, deviceId: true, decodedData: true } })
    const memoryRecord = [...liveReadingsBuffer, ...pendingWriteQueue].find((reading) => reading.id === id)
    if (!record && !memoryRecord) return NextResponse.json({ success: false, error: "Reading not found" }, { status: 404 })
    const source = record ?? { id, deviceId: memoryRecord!.deviceId, decodedData: memoryRecord!.decodedData }
    let databaseDeletedCount = 0
    if (record) {
      const result = await deleteCanonicalAttendanceReadings([id], "Raw attendance reading deleted by administrator")
      databaseDeletedCount = result.deletedReadings
    } else {
      await prisma.qrBiometricDeletion.create({ data: { scanId: source.id, deviceId: source.deviceId, decodedData: source.decodedData } }).catch(async (error: unknown) => {
        if (!String(error).includes("Unique constraint")) throw error
      })
    }
    removeReadingFromBuffer(liveReadingsBuffer, id)
    removeReadingFromBuffer(pendingWriteQueue, id)
    return NextResponse.json({ success: true, module: "qr-biometric-icc", deleted: id, deletedCount: databaseDeletedCount + (memoryRecord && !record ? 1 : 0) })
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Failed to delete QR biometric readings" }, { status: 500 })
  }
}
