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
  vm.runInNewContext(compiled, { Buffer, Date, URL, crypto: require("node:crypto"), exports: cjsModule.exports, module: cjsModule, require }, { filename: filePath })
  return cjsModule.exports
}

const {
  hashFingerprintEventPayload,
  normalizeFingerprintSlot,
  parseFingerprintCommandAck,
  parseFingerprintCommandRequest,
  parseFingerprintEventBatch,
} = loadTypeScriptModule("./lib/fingerprint-device-contract.ts")
const { rebuildAttendanceProjection } = loadTypeScriptModule("./lib/attendance-device-contract.ts")

test("normalizes a bounded fingerprint event batch and defaults to a toggle", () => {
  const parsed = parseFingerprintEventBatch({
    schemaVersion: 1,
    firmwareVersion: "fingerprint-1.2.0",
    bootId: "53f781c5-55d4-4a94-8ef0-89d7ce0df703",
    events: [{
      eventId: "b8f53be5-4da0-48a1-8dd6-25fdf55d9017",
      deviceSequence: "0001842",
      fingerprintSlot: 17,
      fingerprintIndex: 2,
      occurredAt: "2026-08-03T08:05:12.000Z",
      timeQuality: "SYNCED_RTC",
    }],
  })

  assert.equal(parsed.ok, true)
  assert.equal(parsed.value.events[0].deviceSequence, "1842")
  assert.equal(parsed.value.events[0].fingerprintSlot, 17)
  assert.equal(parsed.value.events[0].fingerprintIndex, 2)
  assert.equal(parsed.value.events[0].intent, "FINGERPRINT_TOGGLE")
})

test("rejects malformed fingerprint events and unsafe slots", () => {
  assert.equal(normalizeFingerprintSlot(-1), null)
  assert.equal(normalizeFingerprintSlot(65536), null)
  assert.equal(normalizeFingerprintSlot("17"), 17)

  const parsed = parseFingerprintEventBatch({
    schemaVersion: 1,
    firmwareVersion: "fingerprint-1.2.0",
    bootId: "53f781c5-55d4-4a94-8ef0-89d7ce0df703",
    events: [{
      eventId: "not-a-uuid",
      deviceSequence: "1",
      fingerprintSlot: 17,
      occurredAt: "2026-08-03T08:05:12.000Z",
      timeQuality: "SYNCED_RTC",
    }],
  })
  assert.equal(parsed.ok, false)
})

test("hashes the immutable authenticated fingerprint event", () => {
  const event = {
    eventId: "b8f53be5-4da0-48a1-8dd6-25fdf55d9017",
    deviceSequence: "1842",
    fingerprintSlot: 17,
    fingerprintIndex: 2,
    intent: "FINGERPRINT_TOGGLE",
    occurredAt: new Date("2026-08-03T08:05:12.000Z"),
    timeQuality: "SYNCED_RTC",
  }
  const original = hashFingerprintEventPayload("TAB5-001", "boot-a", event)
  assert.equal(original, hashFingerprintEventPayload("TAB5-001", "boot-a", { ...event }))
  assert.notEqual(original, hashFingerprintEventPayload("TAB5-002", "boot-a", event))
  assert.notEqual(original, hashFingerprintEventPayload("TAB5-001", "boot-a", { ...event, fingerprintSlot: 18 }))
})

test("fingerprint toggles participate in the existing attendance projection", () => {
  const result = rebuildAttendanceProjection([{
    eventId: "fingerprint:1",
    intent: "FINGERPRINT_TOGGLE",
    occurredAt: new Date("2026-08-03T08:05:12.000Z"),
    sourceDeviceId: "TAB5-001",
    deviceSequence: "1",
    timeQuality: "SYNCED_RTC",
  }])
  assert.equal(result.currentState, "IN")
  assert.equal(result.events[0].status, "APPLIED")
})

test("validates command acknowledgements and admin command requests", () => {
  const acknowledgement = parseFingerprintCommandAck({
    commandId: "cmd-123",
    status: "COMPLETED",
  })
  assert.equal(acknowledgement.ok, true)
  assert.equal(acknowledgement.value.commandId, "cmd-123")
  assert.equal(acknowledgement.value.status, "COMPLETED")
  assert.equal(acknowledgement.value.error, null)
  assert.equal(parseFingerprintCommandAck({ commandId: "cmd-123", status: "nope" }).ok, false)

  const request = parseFingerprintCommandRequest({
    commandType: "ENROLL",
    enrollment: " 24115114 ",
    fingerprintSlot: 17,
    fingerprintIndex: 2,
  })
  assert.equal(request.ok, true)
  assert.equal(request.value.enrollmentKey, "24115114")
  assert.equal(request.value.commandType, "ENROLL")
})
