import assert from "node:assert/strict"
import { createRequire } from "node:module"
import { readFileSync } from "node:fs"
import test from "node:test"
import ts from "typescript"
import vm from "node:vm"

const require = createRequire(import.meta.url)

function loadTypeScriptModule(filePath) {
  const source = readFileSync(filePath, "utf8")
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const cjsModule = { exports: {} }
  vm.runInNewContext(compiled, { Buffer, Date, URL, exports: cjsModule.exports, module: cjsModule, require }, { filename: filePath })
  return cjsModule.exports
}

const {
  advanceAttendanceCursor,
  decodeAttendanceCursor,
  encodeAttendanceCursor,
  hashManualAttendancePayload,
  normalizeEnrollmentKey,
  parseManualAttendanceBatch,
  rebuildAttendanceProjection,
} = loadTypeScriptModule("./lib/attendance-device-contract.ts")
const { parseAttendanceDeviceCredentials } = loadTypeScriptModule("./lib/attendance-device-auth-contract.ts")

test("accepts only bearer credentials with a separate normalized device ID", () => {
  const apiKey = `qlicc_${"A".repeat(43)}`
  const headers = new Headers({ authorization: `Bearer ${apiKey}`, "x-device-id": " tab5-001 " })
  const credentials = parseAttendanceDeviceCredentials(headers)
  assert.equal(credentials.deviceId, "TAB5-001")
  assert.equal(credentials.apiKey, apiKey)

  assert.equal(parseAttendanceDeviceCredentials(new Headers({ "x-device-id": "TAB5-001", "x-api-key": apiKey })), null)
  assert.equal(parseAttendanceDeviceCredentials(new Headers({ authorization: `Bearer ${apiKey}` })), null)
  assert.equal(parseAttendanceDeviceCredentials(new Headers({ authorization: "Bearer invalid", "x-device-id": "TAB5-001" })), null)
})

test("normalizes safe enrollment identifiers and rejects unsafe input", () => {
  assert.equal(normalizeEnrollmentKey(" 24115114 "), "24115114")
  assert.equal(normalizeEnrollmentKey(" abc12345 "), "ABC12345")
  assert.equal(normalizeEnrollmentKey("24/115114"), null)
  assert.equal(normalizeEnrollmentKey("123"), null)
  assert.equal(normalizeEnrollmentKey("A".repeat(25)), null)
})

test("validates and normalizes a bounded manual attendance batch", () => {
  const parsed = parseManualAttendanceBatch({
    schemaVersion: 1,
    firmwareVersion: "1.0.0",
    bootId: "53f781c5-55d4-4a94-8ef0-89d7ce0df703",
    events: [{
      eventId: "b8f53be5-4da0-48a1-8dd6-25fdf55d9017",
      deviceSequence: "0001842",
      enrollment: " 24115114 ",
      intent: "MANUAL_SET_IN",
      occurredAt: "2026-08-03T08:05:12.000Z",
      timeQuality: "SYNCED_RTC",
    }],
  })

  assert.equal(parsed.ok, true)
  assert.equal(parsed.value.events[0].deviceSequence, "1842")
  assert.equal(parsed.value.events[0].enrollmentKey, "24115114")
  assert.equal(parsed.value.events[0].occurredAt.toISOString(), "2026-08-03T08:05:12.000Z")
})

test("rejects malformed manual events and oversized batches", () => {
  const invalidUuid = parseManualAttendanceBatch({
    schemaVersion: 1,
    firmwareVersion: "1.0.0",
    bootId: "53f781c5-55d4-4a94-8ef0-89d7ce0df703",
    events: [{
      eventId: "event-1",
      deviceSequence: "1",
      enrollment: "24115114",
      intent: "MANUAL_SET_IN",
      occurredAt: "2026-08-03T08:05:12.000Z",
      timeQuality: "SYNCED_RTC",
    }],
  })
  assert.equal(invalidUuid.ok, false)

  const tooMany = parseManualAttendanceBatch({
    schemaVersion: 1,
    firmwareVersion: "1.0.0",
    bootId: "53f781c5-55d4-4a94-8ef0-89d7ce0df703",
    events: Array.from({ length: 26 }, (_, index) => ({
      eventId: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
      deviceSequence: String(index + 1),
      enrollment: "24115114",
      intent: "MANUAL_SET_OUT",
      occurredAt: "2026-08-03T08:05:12.000Z",
      timeQuality: "SYNCED_RTC",
    })),
  })
  assert.equal(tooMany.ok, false)
})

test("hashes the authenticated immutable manual payload deterministically", () => {
  const event = {
    eventId: "b8f53be5-4da0-48a1-8dd6-25fdf55d9017",
    deviceSequence: "1842",
    enrollmentKey: "24115114",
    intent: "MANUAL_SET_IN",
    occurredAt: new Date("2026-08-03T08:05:12.000Z"),
    timeQuality: "SYNCED_RTC",
  }
  const original = hashManualAttendancePayload("TAB5-001", "boot-a", event)
  assert.equal(original, hashManualAttendancePayload("TAB5-001", "boot-a", { ...event }))
  assert.notEqual(original, hashManualAttendancePayload("TAB5-002", "boot-a", event))
  assert.notEqual(original, hashManualAttendancePayload("TAB5-001", "boot-a", { ...event, intent: "MANUAL_SET_OUT" }))
})

test("round-trips opaque nonnegative attendance cursors", () => {
  for (const sequence of [0n, 1n, 18446744073709551615n]) {
    const cursor = encodeAttendanceCursor(sequence)
    assert.equal(typeof cursor, "string")
    assert.equal(decodeAttendanceCursor(cursor), sequence)
  }
  assert.equal(decodeAttendanceCursor("not-a-cursor"), null)
  assert.equal(decodeAttendanceCursor(""), null)
})

test("advances a feed cursor past every delivered change", () => {
  assert.equal(advanceAttendanceCursor(10n, [8n, 12n, 11n]), 12n)
  assert.equal(advanceAttendanceCursor(10n, []), 10n)
})

test("rebuilds the same projection when an older offline event arrives late", () => {
  const events = [
    {
      eventId: "qr:later",
      intent: "QR_TOGGLE",
      occurredAt: new Date("2026-08-03T09:00:00.000Z"),
      sourceDeviceId: "QRB-001",
      deviceSequence: null,
      timeQuality: "SERVER",
    },
    {
      eventId: "manual:early",
      intent: "MANUAL_SET_IN",
      occurredAt: new Date("2026-08-03T08:00:00.000Z"),
      sourceDeviceId: "TAB5-001",
      deviceSequence: "42",
      timeQuality: "SYNCED_RTC",
    },
  ]
  const result = rebuildAttendanceProjection(events)
  assert.equal(result.currentState, "OUT")
  assert.equal(result.latestEffectiveEventId, "qr:later")
  assert.equal(result.events.find((event) => event.eventId === "manual:early").effectiveState, "IN")
  assert.equal(result.events.find((event) => event.eventId === "qr:later").effectiveState, "OUT")
})

test("uses explicit manual state and suppresses attendance within the cooldown", () => {
  const result = rebuildAttendanceProjection([
    {
      eventId: "manual:1",
      intent: "MANUAL_SET_OUT",
      occurredAt: new Date("2026-08-03T08:00:00.000Z"),
      sourceDeviceId: "TAB5-001",
      deviceSequence: "1",
      timeQuality: "SYNCED_RTC",
    },
    {
      eventId: "qr:duplicate",
      intent: "QR_TOGGLE",
      occurredAt: new Date("2026-08-03T08:00:10.000Z"),
      sourceDeviceId: "QRB-001",
      deviceSequence: null,
      timeQuality: "SERVER",
    },
    {
      eventId: "qr:accepted",
      intent: "QR_TOGGLE",
      occurredAt: new Date("2026-08-03T08:00:31.000Z"),
      sourceDeviceId: "QRB-001",
      deviceSequence: null,
      timeQuality: "SERVER",
    },
  ])

  assert.equal(result.events[0].effectiveState, "OUT")
  assert.equal(result.events[1].status, "SUPPRESSED_DUPLICATE")
  assert.equal(result.events[2].effectiveState, "IN")
  assert.equal(result.currentState, "IN")
})

test("keeps events with untrusted time pending and outside the projection", () => {
  const result = rebuildAttendanceProjection([
    {
      eventId: "manual:untrusted",
      intent: "MANUAL_SET_IN",
      occurredAt: new Date("2026-08-03T08:00:00.000Z"),
      sourceDeviceId: "TAB5-001",
      deviceSequence: "1",
      timeQuality: "UNTRUSTED",
    },
  ])
  assert.equal(result.currentState, "OUT")
  assert.equal(result.latestEffectiveEventId, null)
  assert.equal(result.events[0].status, "PENDING_TIME")
})
