import { createHash } from "node:crypto"

export const ATTENDANCE_BATCH_MAX_EVENTS = 25
export const ATTENDANCE_BATCH_MAX_BYTES = 32 * 1024
export const ATTENDANCE_DUPLICATE_WINDOW_MS = 30_000
export const ATTENDANCE_FEED_RETRY_MS = 1_500

export type AttendanceIntent = "QR_TOGGLE" | "FINGERPRINT_TOGGLE" | "MANUAL_SET_IN" | "MANUAL_SET_OUT"
export type AttendanceTimeQuality = "SERVER" | "SYNCED_RTC" | "UNTRUSTED"
export type AttendanceEventStatus = "APPLIED" | "SUPPRESSED_DUPLICATE" | "PENDING_TIME"
export type AttendanceEntryState = "IN" | "OUT"

export type ManualAttendanceEvent = {
  eventId: string
  deviceSequence: string
  enrollmentKey: string
  intent: "MANUAL_SET_IN" | "MANUAL_SET_OUT"
  occurredAt: Date
  timeQuality: "SYNCED_RTC" | "UNTRUSTED"
}

export type ManualAttendanceBatch = {
  schemaVersion: 1
  firmwareVersion: string
  bootId: string
  events: ManualAttendanceEvent[]
}

export type ProjectionInputEvent = {
  eventId: string
  intent: AttendanceIntent
  occurredAt: Date
  sourceDeviceId: string
  deviceSequence: string | null
  timeQuality: AttendanceTimeQuality
}

export type ProjectionEventResult = ProjectionInputEvent & {
  status: AttendanceEventStatus
  effectiveState: AttendanceEntryState | null
}

const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const DEVICE_SEQUENCE_PATTERN = /^(0|[1-9][0-9]{0,19})$/

function readText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null
  const text = value.trim()
  return text && text.length <= maxLength ? text : null
}

function normalizeDeviceSequence(value: unknown): string | null {
  const text = readText(value, 20)
  if (!text || !/^[0-9]+$/.test(text)) return null
  const normalized = text.replace(/^0+(?=[0-9])/, "")
  return DEVICE_SEQUENCE_PATTERN.test(normalized) ? normalized : null
}

function parseOccurredAt(value: unknown): Date | null {
  const text = readText(value, 40)
  if (!text || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(text)) return null
  const date = new Date(text)
  return Number.isFinite(date.getTime()) ? date : null
}

export function normalizeEnrollmentKey(value: unknown): string | null {
  const text = readText(value, 24)?.toUpperCase()
  return text && /^[A-Z0-9]{4,24}$/.test(text) ? text : null
}

export function parseManualAttendanceBatch(value: unknown): { ok: true; value: ManualAttendanceBatch } | { ok: false; error: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { ok: false, error: "Request body must be an object" }
  const body = value as Record<string, unknown>
  if (body.schemaVersion !== 1) return { ok: false, error: "Unsupported schemaVersion" }

  const firmwareVersion = readText(body.firmwareVersion, 32)
  const bootId = readText(body.bootId, 36)
  if (!firmwareVersion) return { ok: false, error: "firmwareVersion is required" }
  if (!bootId || !UUID_V4_PATTERN.test(bootId)) return { ok: false, error: "bootId must be a UUIDv4" }
  if (!Array.isArray(body.events) || body.events.length < 1 || body.events.length > ATTENDANCE_BATCH_MAX_EVENTS) {
    return { ok: false, error: `events must contain 1-${ATTENDANCE_BATCH_MAX_EVENTS} items` }
  }

  const events: ManualAttendanceEvent[] = []
  const eventIds = new Set<string>()
  for (let index = 0; index < body.events.length; index++) {
    const raw = body.events[index]
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, error: `events[${index}] must be an object` }
    const event = raw as Record<string, unknown>
    const eventId = readText(event.eventId, 36)?.toLowerCase() ?? null
    const deviceSequence = normalizeDeviceSequence(event.deviceSequence)
    const enrollmentKey = normalizeEnrollmentKey(event.enrollment)
    const occurredAt = parseOccurredAt(event.occurredAt)
    const intent = event.intent === "MANUAL_SET_IN" || event.intent === "MANUAL_SET_OUT" ? event.intent : null
    const timeQuality = event.timeQuality === "SYNCED_RTC" || event.timeQuality === "UNTRUSTED" ? event.timeQuality : null

    if (!eventId || !UUID_V4_PATTERN.test(eventId)) return { ok: false, error: `events[${index}].eventId must be a UUIDv4` }
    if (eventIds.has(eventId)) return { ok: false, error: `events[${index}].eventId is duplicated in this batch` }
    if (!deviceSequence) return { ok: false, error: `events[${index}].deviceSequence is invalid` }
    if (!enrollmentKey) return { ok: false, error: `events[${index}].enrollment is invalid` }
    if (!intent) return { ok: false, error: `events[${index}].intent is invalid` }
    if (!occurredAt) return { ok: false, error: `events[${index}].occurredAt must be UTC RFC3339` }
    if (!timeQuality) return { ok: false, error: `events[${index}].timeQuality is invalid` }

    eventIds.add(eventId)
    events.push({ eventId, deviceSequence, enrollmentKey, intent, occurredAt, timeQuality })
  }

  return { ok: true, value: { schemaVersion: 1, firmwareVersion, bootId: bootId.toLowerCase(), events } }
}

export function hashManualAttendancePayload(deviceId: string, bootId: string, event: ManualAttendanceEvent): string {
  const canonical = JSON.stringify({
    deviceId,
    bootId,
    eventId: event.eventId,
    deviceSequence: event.deviceSequence,
    enrollmentKey: event.enrollmentKey,
    intent: event.intent,
    occurredAt: event.occurredAt.toISOString(),
    timeQuality: event.timeQuality,
  })
  return createHash("sha256").update(canonical).digest("hex")
}

export function encodeAttendanceCursor(sequence: bigint): string {
  if (sequence < BigInt(0)) throw new Error("Attendance cursor sequence cannot be negative")
  return Buffer.from(`attendance:v1:${sequence}`, "utf8").toString("base64url")
}

export function decodeAttendanceCursor(cursor: string | null | undefined): bigint | null {
  if (!cursor || typeof cursor !== "string" || cursor.length > 80) return null
  try {
    const decoded = Buffer.from(cursor, "base64url").toString("utf8")
    const match = /^attendance:v1:(0|[1-9][0-9]*)$/.exec(decoded)
    if (!match) return null
    const sequence = BigInt(match[1])
    return encodeAttendanceCursor(sequence) === cursor ? sequence : null
  } catch {
    return null
  }
}

export function advanceAttendanceCursor(current: bigint, deliveredSequences: bigint[]): bigint {
  return deliveredSequences.reduce((highest, sequence) => sequence > highest ? sequence : highest, current)
}

function intentRank(intent: AttendanceIntent): number {
  return intent === "QR_TOGGLE" || intent === "FINGERPRINT_TOGGLE" ? 1 : 0
}

function compareDeviceSequence(left: string | null, right: string | null): number {
  if (left === right) return 0
  if (left === null) return 1
  if (right === null) return -1
  const leftValue = BigInt(left)
  const rightValue = BigInt(right)
  return leftValue < rightValue ? -1 : leftValue > rightValue ? 1 : 0
}

export function compareAttendanceEvents(left: ProjectionInputEvent, right: ProjectionInputEvent): number {
  const timeDifference = left.occurredAt.getTime() - right.occurredAt.getTime()
  if (timeDifference) return timeDifference
  const rankDifference = intentRank(left.intent) - intentRank(right.intent)
  if (rankDifference) return rankDifference
  const deviceDifference = left.sourceDeviceId.localeCompare(right.sourceDeviceId)
  if (deviceDifference) return deviceDifference
  const sequenceDifference = compareDeviceSequence(left.deviceSequence, right.deviceSequence)
  return sequenceDifference || left.eventId.localeCompare(right.eventId)
}

export function rebuildAttendanceProjection(events: ProjectionInputEvent[], duplicateWindowMs = ATTENDANCE_DUPLICATE_WINDOW_MS) {
  const ordered = [...events].sort(compareAttendanceEvents)
  const results: ProjectionEventResult[] = []
  let currentState: AttendanceEntryState = "OUT"
  let latestEffectiveEventId: string | null = null
  let latestOccurredAt: Date | null = null
  let previousAcceptedAt: number | null = null

  for (const event of ordered) {
    if (event.timeQuality === "UNTRUSTED") {
      results.push({ ...event, status: "PENDING_TIME", effectiveState: null })
      continue
    }

    const occurredAt = event.occurredAt.getTime()
    if (previousAcceptedAt !== null && occurredAt - previousAcceptedAt < duplicateWindowMs) {
      results.push({ ...event, status: "SUPPRESSED_DUPLICATE", effectiveState: null })
      continue
    }

    if (event.intent === "QR_TOGGLE" || event.intent === "FINGERPRINT_TOGGLE") currentState = currentState === "IN" ? "OUT" : "IN"
    else currentState = event.intent === "MANUAL_SET_IN" ? "IN" : "OUT"

    previousAcceptedAt = occurredAt
    latestEffectiveEventId = event.eventId
    latestOccurredAt = event.occurredAt
    results.push({ ...event, status: "APPLIED", effectiveState: currentState })
  }

  return { currentState, latestEffectiveEventId, latestOccurredAt, events: results }
}
