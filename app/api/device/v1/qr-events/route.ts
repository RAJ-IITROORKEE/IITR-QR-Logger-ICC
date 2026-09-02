import { createHash } from "node:crypto"

import { after, NextRequest, NextResponse } from "next/server"

import { authenticateAttendanceDevice } from "@/lib/attendance-device-auth"
import { AttendanceEventConflictError, recordCanonicalQrAttendance } from "@/lib/attendance-ledger"
import { isDoswStudentUrl, extractStudentInfo, normalizeDecodedUrl } from "@/lib/qr-biometric-student"
import { prisma } from "@/lib/prisma"
import { publishRealtimeAttendanceHint } from "@/lib/realtime-relay-publisher"
import type { QrStudentInfo } from "@/types/qr-biometric"

export const dynamic = "force-dynamic"
export const revalidate = 0
export const maxDuration = 30

const MAX_BODY_BYTES = 8 * 1024
const MAX_SCAN_ID = 64
const PROFILE_TIMEOUT_MS = 8_000
const RESPONSE_HEADERS = {
  "cache-control": "private, no-store",
  vary: "Authorization, X-Device-Id",
}

function json(body: object, status = 200) {
  return NextResponse.json(body, { status, headers: RESPONSE_HEADERS })
}

function normalizeScanId(value: unknown): string | null {
  if (typeof value !== "string") return null
  const normalized = value.trim()
  return /^[A-Za-z0-9_-]{1,64}$/.test(normalized) ? normalized : null
}

function stableReadingId(deviceId: string, scanId: string, decodedData: string) {
  return createHash("sha256")
    .update(`${deviceId}\0${scanId}\0${decodedData}`)
    .digest("hex")
    .slice(0, 24)
}

async function readStudentProfile(decodedData: string) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), PROFILE_TIMEOUT_MS)
  try {
    const response = await fetch(decodedData, {
      cache: "no-store",
      headers: {
        accept: "text/html,application/xhtml+xml",
        "accept-language": "en-IN,en;q=0.9",
        "user-agent": "Mozilla/5.0 (compatible; QR-Logger-ICC/1.0)",
      },
      signal: controller.signal,
    })
    if (!response.ok) return null
    const contentType = response.headers.get("content-type")?.toLowerCase() ?? ""
    if (contentType && !contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) return null
    const info = extractStudentInfo(await response.text(), decodedData)
    return info.enrollmentNo ? info : null
  } finally {
    clearTimeout(timeout)
  }
}

function storedStudentInfo(value: unknown): QrStudentInfo | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  const info: QrStudentInfo = {}
  for (const [key, raw] of Object.entries(value)) {
    if (typeof raw === "string" && raw.trim()) info[key] = raw.trim()
  }
  return info.enrollmentNo ? info : null
}

async function findKnownStudent(decodedData: string): Promise<QrStudentInfo | null> {
  const identity = await prisma.studentIdentity?.findUnique({
    where: { doswUrl: decodedData },
    select: { enrollmentNo: true, fullName: true },
  })
  if (!identity?.enrollmentNo) return null
  return {
    enrollmentNo: identity.enrollmentNo,
    ...(identity.fullName ? { fullName: identity.fullName } : {}),
  }
}

export async function POST(request: NextRequest) {
  const auth = await authenticateAttendanceDevice(request.headers).catch((error) => {
    console.error("[device-api] QR event authentication unavailable", error)
    return null
  })
  if (!auth) return json({ success: false, error: "Device authentication temporarily unavailable" }, 503)
  if (!auth.ok) return json({ success: false, error: auth.error }, auth.status)

  const declaredLength = Number.parseInt(request.headers.get("content-length") ?? "0", 10)
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    return json({ success: false, error: "Request body exceeds 8 KiB" }, 413)
  }
  const text = await request.text().catch(() => null)
  if (text === null || Buffer.byteLength(text, "utf8") > MAX_BODY_BYTES) {
    return json({ success: false, error: "Request body exceeds 8 KiB" }, 413)
  }
  const body = (() => {
    try {
      return JSON.parse(text) as Record<string, unknown>
    } catch {
      return null
    }
  })()
  if (!body || body.schemaVersion !== 1) return json({ success: false, error: "Unsupported QR event schema" }, 400)

  const scanId = normalizeScanId(body.scanId)
  const decodedData = typeof body.decodedData === "string" ? normalizeDecodedUrl(body.decodedData) : null
  if (!scanId || !decodedData || !isDoswStudentUrl(decodedData)) {
    return json({ success: false, error: "A valid DOSW QR URL and scanId are required" }, 400)
  }

  try {
    const readingId = stableReadingId(auth.device.deviceId, scanId, decodedData)
    const existing = await prisma.qrBiometricReading.findUnique({ where: { id: readingId } })
    if (existing && (existing.deviceId !== auth.device.deviceId || existing.decodedData !== decodedData)) {
      return json({ success: false, error: "QR scan identity conflict" }, 409)
    }
    const studentInfo = storedStudentInfo(existing?.studentInfo) ??
      await findKnownStudent(decodedData) ??
      await readStudentProfile(decodedData)
    if (!studentInfo) return json({ success: false, error: "Student profile could not be resolved" }, 503)
    if (!existing) {
      await prisma.qrBiometricReading.create({
        data: {
          id: readingId,
          deviceId: auth.device.deviceId,
          decodedData,
          scanStatus: "success",
          entryState: "IN",
          characterCount: decodedData.length,
          studentInfo,
          studentInfoStatus: "scraped",
        },
      })
    }

    const result = await recordCanonicalQrAttendance({
      readingId,
      sourceDeviceId: auth.device.deviceId,
      decodedData,
      occurredAt: existing?.createdAt ?? new Date(),
      studentInfo,
      studentPhotoUrl: existing?.studentPhotoUrl ?? null,
    }, { eventId: `qr:${readingId}`, sourceType: "QR", intent: "QR_TOGGLE" })

    after(async () => {
      try {
        const counter = await prisma.attendanceFeedCounter.findUnique({ where: { id: "attendance" } })
        if (counter) await publishRealtimeAttendanceHint(counter.value, new Date())
      } catch (error) {
        console.error("[device-api] Realtime attendance hint failed", error)
      }
    })

    return json({
      success: true,
      schemaVersion: 1,
      eventId: `qr:${readingId}`,
      status: result.status,
      effectiveState: result.effectiveState,
      replayed: Boolean(existing),
      serverTime: new Date().toISOString(),
    })
  } catch (error) {
    if (error instanceof AttendanceEventConflictError) return json({ success: false, error: error.message }, 409)
    console.error("[device-api] QR event storage unavailable", error)
    return json({ success: false, error: "QR attendance temporarily unavailable; retry the same scanId" }, 503)
  }
}
