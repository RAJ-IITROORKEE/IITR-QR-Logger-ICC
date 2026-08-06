import { createHash } from "node:crypto"

export const FINGERPRINT_BATCH_MAX_EVENTS = 25
export const FINGERPRINT_BATCH_MAX_BYTES = 32 * 1024
export const FINGERPRINT_COMMAND_BATCH_SIZE = 20
export const FINGERPRINT_SLOT_MIN = 0
export const FINGERPRINT_SLOT_MAX = 999

export type FingerprintAttendanceIntent = "FINGERPRINT_TOGGLE"
export type FingerprintTimeQuality = "SERVER" | "SYNCED_RTC" | "UNTRUSTED"
export type FingerprintCommandType = "ENROLL" | "DELETE" | "CLEAR" | "SYNC"
export type FingerprintCommandStatus = "PENDING" | "DELIVERED" | "ACKNOWLEDGED" | "COMPLETED" | "FAILED"

export type FingerprintAttendanceEvent = {
  eventId: string
  deviceSequence: string
  fingerprintSlot: number
  fingerprintIndex: number | null
  intent: FingerprintAttendanceIntent
  occurredAt: Date
  timeQuality: FingerprintTimeQuality
}

export type FingerprintAttendanceBatch = {
  schemaVersion: 1
  firmwareVersion: string
  bootId: string
  events: FingerprintAttendanceEvent[]
}

export type FingerprintCommandAck = {
  commandId: string
  status: Exclude<FingerprintCommandStatus, "PENDING" | "DELIVERED">
  error: string | null
}

export type FingerprintCommandRequest = {
  commandType: FingerprintCommandType
  enrollmentKey: string | null
  fingerprintSlot: number | null
  fingerprintIndex: number | null
  payload: Record<string, unknown>
}

const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const DEVICE_SEQUENCE_PATTERN = /^(0|[1-9][0-9]{0,19})$/
const COMMAND_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,95}$/

function readText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null
  const text = value.trim()
  return text && text.length <= maxLength ? text : null
}

function readInteger(value: unknown, min: number, max: number): number | null {
  const number = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN
  return Number.isInteger(number) && number >= min && number <= max ? number : null
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

export function normalizeFingerprintSlot(value: unknown): number | null {
  return readInteger(value, FINGERPRINT_SLOT_MIN, FINGERPRINT_SLOT_MAX)
}

export function normalizeFingerprintIndex(value: unknown): number | null {
  return value == null || value === "" ? null : readInteger(value, 0, 255)
}

export function parseFingerprintEventBatch(value: unknown): { ok: true; value: FingerprintAttendanceBatch } | { ok: false; error: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { ok: false, error: "Request body must be an object" }
  const body = value as Record<string, unknown>
  if (body.schemaVersion !== 1) return { ok: false, error: "Unsupported schemaVersion" }

  const firmwareVersion = readText(body.firmwareVersion, 32)
  const bootId = readText(body.bootId, 36)
  if (!firmwareVersion) return { ok: false, error: "firmwareVersion is required" }
  if (!bootId || !UUID_V4_PATTERN.test(bootId)) return { ok: false, error: "bootId must be a UUIDv4" }
  if (!Array.isArray(body.events) || body.events.length < 1 || body.events.length > FINGERPRINT_BATCH_MAX_EVENTS) {
    return { ok: false, error: `events must contain 1-${FINGERPRINT_BATCH_MAX_EVENTS} items` }
  }

  const events: FingerprintAttendanceEvent[] = []
  const eventIds = new Set<string>()
  for (let index = 0; index < body.events.length; index++) {
    const raw = body.events[index]
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, error: `events[${index}] must be an object` }
    const event = raw as Record<string, unknown>
    const eventId = readText(event.eventId, 36)?.toLowerCase() ?? null
    const deviceSequence = normalizeDeviceSequence(event.deviceSequence)
    const fingerprintSlot = normalizeFingerprintSlot(event.fingerprintSlot ?? event.slot)
    const fingerprintIndex = normalizeFingerprintIndex(event.fingerprintIndex ?? event.index)
    const occurredAt = parseOccurredAt(event.occurredAt)
    const intent = event.intent == null || event.intent === "FINGERPRINT_TOGGLE" ? "FINGERPRINT_TOGGLE" : null
    const timeQuality = event.timeQuality === "SERVER" || event.timeQuality === "SYNCED_RTC" || event.timeQuality === "UNTRUSTED" ? event.timeQuality : null

    if (!eventId || !UUID_V4_PATTERN.test(eventId)) return { ok: false, error: `events[${index}].eventId must be a UUIDv4` }
    if (eventIds.has(eventId)) return { ok: false, error: `events[${index}].eventId is duplicated in this batch` }
    if (!deviceSequence) return { ok: false, error: `events[${index}].deviceSequence is invalid` }
    if (fingerprintSlot === null) return { ok: false, error: `events[${index}].fingerprintSlot is invalid` }
    if (!intent) return { ok: false, error: `events[${index}].intent is invalid` }
    if (!occurredAt) return { ok: false, error: `events[${index}].occurredAt must be UTC RFC3339` }
    if (!timeQuality) return { ok: false, error: `events[${index}].timeQuality is invalid` }

    eventIds.add(eventId)
    events.push({ eventId, deviceSequence, fingerprintSlot, fingerprintIndex, intent, occurredAt, timeQuality })
  }

  return { ok: true, value: { schemaVersion: 1, firmwareVersion, bootId: bootId.toLowerCase(), events } }
}

export function hashFingerprintEventPayload(deviceId: string, bootId: string, event: FingerprintAttendanceEvent): string {
  const canonical = JSON.stringify({
    deviceId,
    bootId,
    eventId: event.eventId,
    deviceSequence: event.deviceSequence,
    fingerprintSlot: event.fingerprintSlot,
    fingerprintIndex: event.fingerprintIndex,
    intent: event.intent,
    occurredAt: event.occurredAt.toISOString(),
    timeQuality: event.timeQuality,
  })
  return createHash("sha256").update(canonical).digest("hex")
}

export function parseFingerprintCommandAck(value: unknown): { ok: true; value: FingerprintCommandAck } | { ok: false; error: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { ok: false, error: "Request body must be an object" }
  const body = value as Record<string, unknown>
  const commandId = readText(body.commandId, 96)
  const status = body.status === "ACKNOWLEDGED" || body.status === "COMPLETED" || body.status === "FAILED" ? body.status : null
  const error = body.error == null ? null : readText(body.error, 500)
  if (!commandId || !COMMAND_ID_PATTERN.test(commandId)) return { ok: false, error: "commandId is invalid" }
  if (!status) return { ok: false, error: "status must be ACKNOWLEDGED, COMPLETED, or FAILED" }
  if (body.error != null && error === null) return { ok: false, error: "error is invalid" }
  return { ok: true, value: { commandId, status, error } }
}

export function parseFingerprintCommandRequest(value: unknown): { ok: true; value: FingerprintCommandRequest } | { ok: false; error: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { ok: false, error: "Request body must be an object" }
  const body = value as Record<string, unknown>
  const commandType = body.commandType ?? body.command
  if (commandType !== "ENROLL" && commandType !== "DELETE" && commandType !== "CLEAR" && commandType !== "SYNC") {
    return { ok: false, error: "commandType must be ENROLL, DELETE, CLEAR, or SYNC" }
  }

  const enrollmentKey = body.enrollment == null ? null : readText(body.enrollment, 24)?.toUpperCase() ?? null
  const fingerprintSlot = body.fingerprintSlot == null && body.slot == null ? null : normalizeFingerprintSlot(body.fingerprintSlot ?? body.slot)
  const fingerprintIndex = normalizeFingerprintIndex(body.fingerprintIndex ?? body.index)
  if (body.enrollment != null && (!enrollmentKey || !/^[A-Z0-9]{4,24}$/.test(enrollmentKey))) return { ok: false, error: "enrollment is invalid" }
  if ((body.fingerprintSlot != null || body.slot != null) && fingerprintSlot === null) return { ok: false, error: "fingerprintSlot is invalid" }
  if ((commandType === "ENROLL" || commandType === "DELETE") && (enrollmentKey === null || fingerprintSlot === null)) {
    return { ok: false, error: "ENROLL and DELETE commands require enrollment and fingerprintSlot" }
  }

  const payload = body.payload && typeof body.payload === "object" && !Array.isArray(body.payload) ? body.payload as Record<string, unknown> : {}
  return { ok: true, value: { commandType, enrollmentKey, fingerprintSlot, fingerprintIndex, payload } }
}
