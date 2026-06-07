import { NextResponse } from "next/server"

import { addDoswStudentPhotoFallback, extractStudentInfo, isDoswStudentUrl, normalizeDecodedUrl } from "@/lib/qr-biometric-student"
import { prisma } from "@/lib/prisma"
import type { QrBiometricReading, QrEntryState, QrStudentInfo, QrStudentInfoStatus } from "@/types/qr-biometric"

export const dynamic = "force-dynamic"
export const revalidate = 0

const DEFAULT_LIMIT = 20
const MAX_LIMIT = 200
const MAX_FETCH_LIMIT = 5000
const MAX_BUFFER_SIZE = 500
const MAX_PENDING_QUEUE = 500
const DEVICE_HISTORY_LIMIT = 5000
const ONLINE_SECONDS = 35
const STUDENT_PROFILE_TIMEOUT_MS = 8000
const EXPECTED_QR_PATTERN = "https://dosw.iitr.ac.in/StudentProxy.aspx?id=..."

type DbSaveStatus = "saved" | "queued"
type SortKey = "createdAt" | "deviceId" | "entryState" | "characterCount"
type SortOrder = "asc" | "desc"

const liveReadingsBuffer: QrBiometricReading[] = []
const pendingWriteQueue: QrBiometricReading[] = []

function parseText(value: unknown): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed || null
}

function parseDecodedData(body: Record<string, unknown> | null): string | null {
  if (!body) return null
  return parseText(body.decodedData) ?? parseText(body.qrData) ?? parseText(body.data)
}

function parsePositiveInt(value: string | null, fallback: number, max: number): number {
  if (!value) return fallback
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed) || parsed < 1) return fallback
  return Math.min(parsed, max)
}

function parseSort(value: string | null): SortKey {
  if (value === "deviceId" || value === "entryState" || value === "characterCount") return value
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
  try {
    const latest = await prisma.qrBiometricReading.findFirst({
      where: { decodedData },
      orderBy: { createdAt: "desc" },
      select: { entryState: true },
    })
    return normalizeEntryState(latest?.entryState) === "IN" ? "OUT" : "IN"
  } catch (error) {
    console.error("[qr-biometric] Failed to resolve entry state", error)
    return "IN"
  }
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
  }
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

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  const deviceId = parseText(body?.deviceId)
  const decodedData = parseDecodedData(body)

  if (!deviceId || !decodedData) {
    return NextResponse.json({ success: false, module: "qr-biometric", error: "Invalid payload. Expected { deviceId: string, decodedData: string }" }, { status: 400 })
  }

  if (!isDoswStudentUrl(decodedData)) {
    return NextResponse.json({ success: false, module: "qr-biometric", scanStatus: "invalid_qr", message: "INVALID QR", error: `Invalid QR. Expected ${EXPECTED_QR_PATTERN}`, expectedPattern: EXPECTED_QR_PATTERN }, { status: 422 })
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
    module: "qr-biometric",
    message: dbStatus === "saved" ? "QRBiometric scan received and stored" : "QRBiometric scan received and queued for database retry",
    storage: "hybrid-mongodb-buffer",
    studentProfile: { status: studentProfile.status, error: studentProfile.error },
    persistence: { status: dbStatus, queuedWrites: pendingWriteQueue.length },
    received: reading,
  })
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const limit = parsePositiveInt(searchParams.get("limit"), DEFAULT_LIMIT, MAX_LIMIT)
  const page = parsePositiveInt(searchParams.get("page"), 1, Number.MAX_SAFE_INTEGER)
  const deviceId = parseText(searchParams.get("deviceId"))
  const search = parseText(searchParams.get("search")) ?? ""
  const sort = parseSort(searchParams.get("sort"))
  const order = parseOrder(searchParams.get("order"))
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
      orderBy: sort === "createdAt" ? { createdAt: order } : [{ [sort]: order }, { createdAt: "desc" }],
      take: MAX_FETCH_LIMIT,
    })
    dbReadings = records.map(toApiReading)
  } catch (error) {
    dbConnected = false
    console.error("[qr-biometric] Failed to fetch readings", error)
  }

  const liveReadings = filterLiveReadings(liveReadingsBuffer, deviceId, from, to)
  const merged = mergeReadings(dbReadings, liveReadings)
  const searched = applySearch(merged, search)
  const sorted = sortReadings(searched, sort, order)
  const paginated = paginateReadings(sorted, page, limit)
  const analysis = buildAnalysis(merged)
  const stats = buildStats(merged)
  const latest = merged[0] ?? null
  const lastSeenSeconds = latest ? Math.max(0, Math.floor((Date.now() - new Date(latest.timestamp).getTime()) / 1000)) : null

  return NextResponse.json({
    success: true,
    module: "qr-biometric",
    endpoint: "/api/qr-biometric",
    storage: dbConnected ? "hybrid-mongodb-buffer" : "in-memory-buffer",
    expectedPayload: { deviceId: "string (e.g. QRB-001)", decodedData: "string (raw QR decoded data)" },
    acceptedQrPattern: EXPECTED_QR_PATTERN,
    query: { limit, page: paginated.page, deviceId, search: search || null, sort, order, from: from?.toISOString() ?? null, to: to?.toISOString() ?? null, month },
    count: paginated.items.length,
    totalCount: searched.length,
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

export async function DELETE(request: Request) {
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
      return NextResponse.json({ success: true, module: "qr-biometric", deletedCount: result.count })
    }

    await prisma.qrBiometricReading.delete({ where: { id: body.id as string } })
    return NextResponse.json({ success: true, module: "qr-biometric", deleted: body.id })
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Failed to delete QR biometric readings" }, { status: 500 })
  }
}
