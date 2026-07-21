import { NextRequest, NextResponse } from "next/server"

import { ACCESS_SESSION_COOKIE, ADMIN_ACCESS_ROLES, verifyAccessSession } from "@/lib/access-auth"
import { ADMIN_SESSION_COOKIE, verifyAdminSession } from "@/lib/admin-auth"
import { resolveDeviceMacRegistration } from "@/lib/device-mac-registration"
import { verifyDeviceApiKey } from "@/lib/device-api-key"
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
const DEVICE_HISTORY_LIMIT = 5000
const ONLINE_SECONDS = 35
const STUDENT_PROFILE_TIMEOUT_MS = 8000
const EXPECTED_QR_PATTERN = "https://dosw.iitr.ac.in/StudentProxy.aspx?id=..."
const RECEIVER_ENDPOINT = "/api/qr-biometric-icc"
const MANUAL_DEVICE_ID = "MANUAL"

type DbSaveStatus = "saved" | "queued"
type SortKey = "createdAt" | "deviceId" | "entryState" | "scanStatus" | "characterCount"
type SortOrder = "asc" | "desc"
type AuthenticatedDevice = {
  id: string
  deviceNumber: string
  apiKeyHash: string | null
  macAddress: string | null
  macAddressLockedAt: Date | null
}
type DeviceAuthResult = { ok: true; error: null; device: AuthenticatedDevice } | { ok: false; error: string }

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

function parseDate(value: string | null): Date | null {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function parseMonthRange(value: string | null): { start: Date; end: Date } | null {
  if (!value || !/^\d{4}-\d{2}$/.test(value)) return null
  const [year, month] = value.split("-").map(Number)
  if (!year || !month || month < 1 || month > 12) return null
  const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0))
  const end = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0))
  return { start, end }
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

async function fetchStudentInfo(decodedData: string): Promise<{ status: QrStudentInfoStatus; info: QrStudentInfo | null; error: string | null }> {
  const profileUrl = normalizeDecodedUrl(decodedData)
  if (!profileUrl || !isDoswStudentUrl(profileUrl)) return { status: "not_applicable", info: null, error: null }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), STUDENT_PROFILE_TIMEOUT_MS)

  try {
    const response = await fetch(profileUrl, {
      cache: "no-store",
      headers: {
        "user-agent": "QR-BIOMETRIC-CC/1.0 ICC-IITR",
        accept: "text/html,application/xhtml+xml",
      },
      signal: controller.signal,
    })
    if (!response.ok) return { status: "failed", info: null, error: `Student profile returned HTTP ${response.status}` }

    const info = extractStudentInfo(await response.text(), profileUrl)
    if (!hasUsefulStudentInfo(info)) return { status: "failed", info: null, error: "Student profile did not contain readable fields" }
    return { status: "scraped", info, error: null }
  } catch (error) {
    return { status: "failed", info: null, error: error instanceof Error ? error.message : "Failed to scrape student profile" }
  } finally {
    clearTimeout(timeout)
  }
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
    select: { id: true, deviceNumber: true, apiKeyHash: true, macAddress: true, macAddressLockedAt: true },
  })
  if (!device || !verifyDeviceApiKey(apiKey, device.apiKeyHash)) return { ok: false, error: "Invalid device ID or API key" }

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

function createReading(deviceId: string, decodedData: string, entryState: QrEntryState, studentProfile: { status: QrStudentInfoStatus; info: QrStudentInfo | null; error: string | null }): QrBiometricReading {
  return {
    id: crypto.randomUUID(),
    deviceId,
    decodedData,
    decodedUrl: normalizeDecodedUrl(decodedData),
    scanStatus: "success",
    entryState,
    characterCount: decodedData.length,
    studentInfo: studentProfile.info,
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
    studentInfoStatus: status === "scraped" || status === "failed" ? status : "not_applicable",
    studentInfoError: record.studentInfoError ?? null,
    timestamp: record.createdAt.toISOString(),
  }
}

function sameUtcDay(date: Date, now = new Date()) {
  return date.getUTCFullYear() === now.getUTCFullYear() && date.getUTCMonth() === now.getUTCMonth() && date.getUTCDate() === now.getUTCDate()
}

function sameUtcMonth(date: Date, now = new Date()) {
  return date.getUTCFullYear() === now.getUTCFullYear() && date.getUTCMonth() === now.getUTCMonth()
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
    dailyScans: readings.filter((r) => sameUtcDay(new Date(r.timestamp))).length,
    dailyIn: readings.filter((r) => sameUtcDay(new Date(r.timestamp)) && r.entryState === "IN").length,
    dailyOut: readings.filter((r) => sameUtcDay(new Date(r.timestamp)) && r.entryState === "OUT").length,
    qrDeviceScans: readings.filter((r) => r.deviceId !== MANUAL_DEVICE_ID).length,
    manualScans: readings.filter((r) => r.deviceId === MANUAL_DEVICE_ID).length,
    monthlyScans: readings.filter((r) => sameUtcMonth(new Date(r.timestamp))).length,
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

    const date = reading.timestamp.slice(0, 10)
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
  if (!source.studentInfo) return target
  if (!target.studentInfo) {
    return { ...target, studentInfo: source.studentInfo, studentInfoStatus: source.studentInfoStatus, studentInfoError: source.studentInfoError }
  }
  if (target.studentInfo.photoUrl || !source.studentInfo.photoUrl) return target

  return {
    ...target,
    studentInfo: { ...source.studentInfo, ...target.studentInfo, photoUrl: source.studentInfo.photoUrl },
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

async function saveReadingToDatabase(reading: QrBiometricReading) {
  const record = await prisma.qrBiometricReading.create({
    data: {
      deviceId: reading.deviceId,
      decodedData: reading.decodedData,
      scanStatus: reading.scanStatus,
      entryState: reading.entryState,
      characterCount: reading.characterCount,
      studentInfo: toStoredStudentInfo(reading.studentInfo),
      studentInfoStatus: reading.studentInfoStatus,
      studentInfoError: reading.studentInfoError ?? undefined,
      createdAt: new Date(reading.timestamp),
    },
  })

  void pruneStoredReadings(reading.deviceId).catch((error) => console.error("[qr-biometric] Retention prune failed", error))
  return record
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
      await saveReadingToDatabase(reading)
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
  })
  pushWithLimit(liveReadingsBuffer, reading, MAX_BUFFER_SIZE)

  await flushPendingQueue().catch(() => null)

  let dbStatus: DbSaveStatus = "saved"
  try {
    await saveReadingToDatabase(reading)
  } catch (error) {
    dbStatus = "queued"
    pushWithLimit(pendingWriteQueue, reading, MAX_PENDING_QUEUE)
    console.error("[qr-biometric] Manual database save unavailable, queued reading", error)
  }

  return { reading, dbStatus }
}

function mergeReadings(dbReadings: QrBiometricReading[], liveReadings: QrBiometricReading[]) {
  const deduped = new Map<string, QrBiometricReading>()
  for (const reading of [...liveReadings, ...dbReadings]) {
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
  const deviceOnlineEvent = isDeviceOnlineEvent(body)

  if (!deviceId) {
    return NextResponse.json({ success: false, module: "qr-biometric-icc", error: "Invalid payload. Expected { deviceId: string, apiKey: string, decodedData: string }" }, { status: 400 })
  }

  const auth = await authenticateDevice(deviceId, apiKey)
  if (!auth.ok) {
    return NextResponse.json({ success: false, module: "qr-biometric-icc", error: auth.error }, { status: 401 })
  }

  if (deviceOnlineEvent || (deviceMacAddress && !decodedData)) {
    if (!deviceMacAddress) {
      return NextResponse.json({ success: false, module: "qr-biometric-icc", error: "Invalid payload. Expected macAddress for device-online event" }, { status: 400 })
    }

    const registration = await saveDeviceMacRegistration(auth.device, deviceMacAddress)
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

  if (deviceMacAddress) {
    const registration = await saveDeviceMacRegistration(auth.device, deviceMacAddress)
    if (!registration.ok) {
      return NextResponse.json({ success: false, module: "qr-biometric-icc", deviceId, macStatus: registration.status, error: registration.error }, { status: registration.status === "conflict" ? 409 : 400 })
    }
  }

  if (!isDoswStudentUrl(decodedData)) {
    return NextResponse.json({ success: false, module: "qr-biometric-icc", scanStatus: "invalid_qr", message: "INVALID QR", error: `Invalid QR. Expected ${EXPECTED_QR_PATTERN}`, expectedPattern: EXPECTED_QR_PATTERN }, { status: 422 })
  }

  const [entryState, studentProfile] = await Promise.all([resolveEntryState(decodedData), fetchStudentInfo(decodedData)])
  const reading = createReading(deviceId, decodedData, entryState, studentProfile)
  pushWithLimit(liveReadingsBuffer, reading, MAX_BUFFER_SIZE)

  await flushPendingQueue().catch(() => null)

  let dbStatus: DbSaveStatus = "saved"
  try {
    await saveReadingToDatabase(reading)
  } catch (error) {
    dbStatus = "queued"
    pushWithLimit(pendingWriteQueue, reading, MAX_PENDING_QUEUE)
    console.error("[qr-biometric] Database unavailable, queued reading", error)
  }

  return NextResponse.json({
    success: true,
    module: "qr-biometric-icc",
    endpoint: RECEIVER_ENDPOINT,
    message: dbStatus === "saved" ? "QRBiometric scan received and stored" : "QRBiometric scan received and queued for database retry",
    storage: "hybrid-mongodb-buffer",
    deviceId: reading.deviceId,
    scanStatus: reading.scanStatus,
    entryState: reading.entryState,
    fullName: reading.studentInfo?.fullName ?? null,
    enrollmentNo: reading.studentInfo?.enrollmentNo ?? null,
    studentProfile: { status: studentProfile.status, error: studentProfile.error },
    persistence: { status: dbStatus, queuedWrites: pendingWriteQueue.length },
    received: reading,
  })
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
  const monthRange = parseMonthRange(month)
  const from = monthRange?.start ?? parseDate(searchParams.get("from"))
  const to = monthRange?.end ?? parseDate(searchParams.get("to"))

  const queueResult = await flushPendingQueue().catch(() => ({ flushed: 0, remaining: pendingWriteQueue.length }))
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
  const merged = mergeReadings(dbReadings, liveReadings)
  const accessibleReadings = adminReadAccess ? merged : merged.slice(0, PUBLIC_LOG_LIMIT)
  const searched = applySearch(accessibleReadings, search)
  const sorted = sortReadings(searched, sort, order)
  const paginated = paginateReadings(sorted, page, limit)
  const analysis = buildAnalysis(accessibleReadings)
  const stats = buildStats(merged)
  const latest = accessibleReadings[0] ?? null
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
      const monthRange = parseMonthRange(body.month ?? null)
      const from = monthRange?.start ?? parseDate(body.from ?? null)
      const to = monthRange?.end ?? parseDate(body.to ?? null)
      const where: { deviceId?: string; createdAt?: { gte?: Date; lt?: Date } } = {}
      if (body.deviceId) where.deviceId = body.deviceId
      if (from || to) where.createdAt = { ...(from ? { gte: from } : {}), ...(to ? { lt: to } : {}) }
      const result = await prisma.qrBiometricReading.deleteMany({ where })
      return NextResponse.json({ success: true, module: "qr-biometric-icc", deletedCount: result.count })
    }

    await prisma.qrBiometricReading.delete({ where: { id: body.id as string } })
    return NextResponse.json({ success: true, module: "qr-biometric-icc", deleted: body.id })
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Failed to delete QR biometric readings" }, { status: 500 })
  }
}
