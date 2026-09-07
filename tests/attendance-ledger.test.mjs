import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import test from "node:test"
import vm from "node:vm"
import ts from "typescript"
import * as contract from "../lib/attendance-device-contract.ts"
import * as photo from "../lib/qr-biometric-photo.ts"
import * as student from "../lib/qr-biometric-student.ts"

const PHOTO = "https://test.private.blob.vercel-storage.com/student-photos/test.jpg"

function identity(id) {
  return { id, enrollmentKey: `TEST${id}`, enrollmentNo: `TEST${id}`, doswUrl: `https://dosw.iitr.ac.in/StudentProxy.aspx?id=test-${id}`, fullName: `Test ${id}`, profile: {}, studentPhotoUrl: null, photoVersion: 1 }
}

function event(id, owner, minute, overrides = {}) {
  return { eventId: `qr:${id}`, studentIdentityId: owner.id, enrollmentKey: owner.enrollmentKey, occurredAt: new Date(`2026-08-05T10:${minute}:00Z`), intent: "QR_TOGGLE", sourceType: "QR", sourceDeviceId: "TEST-QR", deviceSequence: null, status: "APPLIED", effectiveState: "IN", timeQuality: "SERVER", ...overrides }
}

function matches(row, where = {}) {
  return Object.entries(where).every(([key, value]) => {
    if (key === "OR") return value.some((part) => matches(row, part))
    if (key === "AND") return value.every((part) => matches(row, part))
    if (value instanceof Date) return row[key]?.getTime() === value.getTime()
    if (value && typeof value === "object") {
      return Object.entries(value).every(([operator, expected]) => {
        if (operator === "in") return expected.includes(row[key])
        if (operator === "notIn") return !expected.includes(row[key])
        if (operator === "not") return row[key] !== expected
        if (operator === "isSet") return (row[key] !== undefined) === expected
        throw new Error(`Unsupported filter: ${operator}`)
      })
    }
    return row[key] === value
  })
}

function table(rows) {
  const findMany = async ({ where, orderBy = [], take } = {}) => {
    const order = Array.isArray(orderBy) ? orderBy : [orderBy]
    const found = rows.filter((row) => matches(row, where)).sort((left, right) => {
      for (const clause of order) {
        const [key, direction] = Object.entries(clause)[0]
        const comparison = left[key] < right[key] ? -1 : left[key] > right[key] ? 1 : 0
        if (comparison) return direction === "desc" ? -comparison : comparison
      }
      return 0
    })
    return take === undefined ? found : found.slice(0, take)
  }
  const apply = (row, data) => {
    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined) row[key] = value && typeof value === "object" && "increment" in value ? row[key] + value.increment : value
    }
    return row
  }
  return {
    findMany,
    findFirst: async (query) => (await findMany(query))[0] ?? null,
    findUnique: async ({ where }) => rows.find((row) => matches(row, where)) ?? null,
    create: async ({ data }) => { const row = { ...data }; rows.push(row); return row },
    update: async ({ where, data }) => apply(rows.find((row) => matches(row, where)), data),
    updateMany: async ({ where, data }) => { const found = rows.filter((row) => matches(row, where)); found.forEach((row) => apply(row, data)); return { count: found.length } },
    upsert: async ({ where, create, update }) => {
      const row = rows.find((row) => matches(row, where))
      if (row) return apply(row, update)
      rows.push({ ...create })
      return rows.at(-1)
    },
    deleteMany: async ({ where }) => {
      const found = rows.filter((row) => matches(row, where))
      for (const row of found) rows.splice(rows.indexOf(row), 1)
      return { count: found.length }
    },
  }
}

function cloneValue(value) {
  if (Object.prototype.toString.call(value) === "[object Date]") return new Date(value)
  if (Array.isArray(value)) return value.map(cloneValue)
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, cloneValue(item)]))
  }
  return value
}

function loadLedger(identities = [], events = []) {
  const changes = []
  const projections = identities.map((owner) => {
    const rebuilt = contract.rebuildAttendanceProjection(events.filter((item) => item.studentIdentityId === owner.id && item.status === "APPLIED" && !item.voidedAt))
    return { enrollmentKey: owner.enrollmentKey, studentIdentityId: owner.id, currentState: rebuilt.currentState, latestEffectiveEventId: rebuilt.latestEffectiveEventId, latestOccurredAt: rebuilt.latestOccurredAt, version: 1 }
  })
  const counters = []
  const deletions = []
  const readings = events.filter((item) => item.eventId.startsWith("qr:")).map((item) => ({
    id: item.eventId.slice(3), deviceId: item.sourceDeviceId, decodedData: "test",
    entryState: item.effectiveState,
  }))
  const transactionTables = [identities, events, projections, changes, counters, deletions, readings]
  const tx = {
    studentIdentity: table(identities), attendanceEvent: table(events), attendanceProjection: table(projections),
    attendanceChange: table(changes), attendanceFeedCounter: table(counters), qrBiometricDeletion: table(deletions),
    qrBiometricReading: table(readings),
  }
  const source = readFileSync("./lib/attendance-ledger.ts", "utf8")
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const cjsModule = { exports: {} }
  vm.runInNewContext(compiled, {
    Date, setTimeout, console,
    exports: cjsModule.exports, module: cjsModule,
    require: (specifier) => {
      if (specifier === "node:crypto") return { createHash }
      if (specifier === "./attendance-device-contract.ts") return contract
      if (specifier === "./qr-biometric-photo.ts") return photo
      if (specifier === "./qr-biometric-student.ts") return student
      if (specifier === "./prisma.ts") return { prisma: { $transaction: async (operation) => {
        const snapshot = transactionTables.map(cloneValue)
        try {
          return await operation(tx)
        } catch (error) {
          transactionTables.forEach((rows, index) => rows.splice(0, rows.length, ...snapshot[index]))
          throw error
        }
      } } }
      throw new Error(`Unexpected module: ${specifier}`)
    },
  })
  return {
    ...cjsModule.exports, changes, events, projections, readings,
    latest: () => changes.filter((item) => item.kind === "LATEST_SNAPSHOT").at(-1)?.snapshot,
  }
}

function manualInput(overrides = {}) {
  return {
    manualActionId: "abcdef0123456789abcdef01",
    decodedData: "https://dosw.iitr.ac.in/StudentProxy.aspx?id=test-A",
    occurredAt: new Date("2026-08-05T10:15:00Z"),
    entryState: "OUT",
    studentInfo: { enrollmentNo: "TESTA", fullName: "Manual A" },
    studentPhotoUrl: null,
    studentInfoStatus: "scraped",
    studentInfoError: null,
    ...overrides,
  }
}

test("late photo completion for an older student keeps the global latest student", async () => {
  const older = identity("A"), newer = identity("B")
  const ledger = loadLedger([older, newer], [event("older", older, "00"), event("newer", newer, "10")])
  await ledger.updateCanonicalStudentPhoto(older.doswUrl, older.enrollmentNo, PHOTO)
  assert.equal(older.photoVersion, 2)
  assert.equal(ledger.latest().event.eventId, "qr:newer")
  assert.equal(ledger.latest().student.identityId, newer.id)
  assert.equal(ledger.latest().student.photoPath, null)
})

test("late rebuild of an older student does not regress latest attendance", async () => {
  const older = identity("A"), newer = identity("B")
  const ledger = loadLedger([older, newer], [event("older", older, "00"), event("newer", newer, "10")])
  await ledger.recordManualAttendanceBatch({ deviceId: "TEST-TAB" }, { bootId: "test-boot", events: [{ eventId: "test-manual", deviceSequence: "1", enrollmentKey: older.enrollmentKey, intent: "MANUAL_SET_OUT", occurredAt: new Date("2026-08-05T10:05:00Z"), timeQuality: "SYNCED_RTC" }] })
  assert.equal(ledger.latest().event.eventId, "qr:newer")
  assert.equal(ledger.latest().event.entryState, "IN")
  assert.equal(ledger.latest().projectionVersion, 1)
  assert.equal(ledger.changes.at(-1).kind, "EVENT_STATUS")
})

test("latest student's late photo refreshes metadata without changing event or projection", async () => {
  const owner = identity("A")
  const ledger = loadLedger([owner], [event("latest", owner, "10")])
  await ledger.publishLatestAttendanceSnapshot()
  await ledger.updateCanonicalStudentPhoto(owner.doswUrl, owner.enrollmentNo, PHOTO)
  assert.equal(ledger.latest().event.eventId, "qr:latest")
  assert.equal(ledger.latest().projectionVersion, 1)
  assert.equal(ledger.latest().student.photoVersion, 2)
  assert.equal(ledger.latest().student.photoPath, `/api/device/v1/photos/${owner.id}?v=2`)
})

test("an older event for the latest student refreshes its effective state and projection version", async () => {
  const owner = identity("A")
  const ledger = loadLedger([owner], [event("latest", owner, "10")])
  await ledger.publishLatestAttendanceSnapshot()
  await ledger.recordManualAttendanceBatch({ deviceId: "TEST-TAB" }, { bootId: "test-boot", events: [{ eventId: "test-earlier", deviceSequence: "1", enrollmentKey: owner.enrollmentKey, intent: "MANUAL_SET_IN", occurredAt: new Date("2026-08-05T10:00:00Z"), timeQuality: "SYNCED_RTC" }] })
  assert.equal(ledger.latest().event.eventId, "qr:latest")
  assert.equal(ledger.latest().event.occurredAt, "2026-08-05T10:10:00.000Z")
  assert.equal(ledger.latest().event.entryState, "OUT")
  assert.equal(ledger.latest().projectionVersion, 2)
})

test("deleting an earlier toggle refreshes the state of the same global latest event", async () => {
  const owner = identity("A")
  const ledger = loadLedger([owner], [event("earlier", owner, "00"), event("latest", owner, "10", { effectiveState: "OUT" })])
  await ledger.publishLatestAttendanceSnapshot()
  assert.equal(ledger.latest().event.entryState, "OUT")
  await ledger.deleteCanonicalAttendanceReadings(["earlier"], "test deletion")
  assert.equal(ledger.latest().event.eventId, "qr:latest")
  assert.equal(ledger.latest().event.entryState, "IN")
  assert.equal(ledger.latest().projectionVersion, 2)
})

test("deleting the latest student's only event publishes the remaining global latest", async () => {
  const older = identity("A"), newer = identity("B")
  const ledger = loadLedger([older, newer], [event("older", older, "00"), event("newer", newer, "10")])
  await ledger.publishLatestAttendanceSnapshot()
  await ledger.deleteCanonicalAttendanceReadings(["newer"], "test deletion")
  assert.equal(ledger.latest().event.eventId, "qr:older")
  assert.equal(ledger.latest().student.identityId, older.id)
})

test("deleting all effective attendance publishes an explicit empty latest", async () => {
  const owner = identity("A")
  const ledger = loadLedger([owner], [event("only", owner, "10")])
  await ledger.publishLatestAttendanceSnapshot()
  await ledger.deleteCanonicalAttendanceReadings(["only"], "test deletion")
  assert.equal(ledger.latest().event, null)
  assert.equal(ledger.latest().student, null)
  assert.equal(ledger.latest().projectionVersion, 0)
})

test("an empty ledger publishes empty latest rather than leaving a cached student", async () => {
  const ledger = loadLedger()
  await ledger.publishLatestAttendanceSnapshot()
  assert.equal(ledger.latest()?.event, null)
  assert.equal(ledger.latest()?.student, null)
})

test("equal-time global latest follows the deterministic attendance ordering, not insertion order", async () => {
  const left = identity("A"), right = identity("B")
  const first = event("a", left, "10", { sourceDeviceId: "TEST-Z" })
  const second = event("z", right, "10", { sourceDeviceId: "TEST-A" })
  for (const events of [[first, second], [second, first]]) {
    const ledger = loadLedger([right, left], events)
    await ledger.publishLatestAttendanceSnapshot()
    assert.equal(ledger.latest().event.eventId, first.eventId)
  }
})

test("pending, suppressed, conflicted, rejected and voided events cannot become global latest", async () => {
  const owner = identity("A")
  const invalid = ["PENDING_TIME", "PENDING_IDENTITY", "SUPPRESSED_DUPLICATE", "IDENTITY_CONFLICT", "REJECTED", "VOIDED"].map((status, index) => event(`invalid-${index}`, owner, "20", { status }))
  invalid.push(event("voided-applied", owner, "30", { voidedAt: new Date() }))
  const ledger = loadLedger([owner], [event("effective", owner, "00"), ...invalid])
  await ledger.publishLatestAttendanceSnapshot()
  assert.equal(ledger.latest().event.eventId, "qr:effective")
})

test("manual attendance commits raw and canonical records together and replays its action ID", async () => {
  const owner = identity("A")
  const ledger = loadLedger([owner])
  const input = manualInput()

  const first = await ledger.recordManualQrAttendance(input)
  const replay = await ledger.recordManualQrAttendance(input)

  assert.equal(first.status, "APPLIED")
  assert.equal(first.effectiveState, "OUT")
  assert.equal(replay.reading.id, input.manualActionId)
  assert.equal(ledger.readings.length, 1)
  assert.equal(ledger.events.filter((item) => item.eventId === `legacy:${input.manualActionId}`).length, 1)
  assert.equal(ledger.readings[0].attendanceEventId, `legacy:${input.manualActionId}`)
})

test("manual non-durable and conflicting actions roll back every ledger record", async () => {
  const ownerA = identity("A")
  const ownerB = identity("B")
  const pending = loadLedger([ownerA])
  const pendingInput = manualInput({ decodedData: "https://invalid.example.test/student" })

  await assert.rejects(() => pending.recordManualQrAttendance(pendingInput), {
    name: "NonDurableCanonicalAttendanceError",
  })
  assert.equal(pending.readings.length, 0)
  assert.equal(pending.events.length, 0)
  assert.equal(pending.projections.length, 1)
  assert.equal(pending.changes.length, 0)

  const conflict = loadLedger([ownerA, ownerB])
  await assert.rejects(() => conflict.recordManualQrAttendance(manualInput({
    decodedData: "https://dosw.iitr.ac.in/StudentProxy.aspx?id=test-B",
  })), { name: "NonDurableCanonicalAttendanceError" })
  assert.equal(conflict.readings.length, 0)
  assert.equal(conflict.events.length, 0)
  assert.equal(conflict.changes.length, 0)
})

test("manual action IDs cannot be reused with different attendance data", async () => {
  const owner = identity("A")
  const ledger = loadLedger([owner])
  await ledger.recordManualQrAttendance(manualInput())

  await assert.rejects(() => ledger.recordManualQrAttendance(manualInput({ entryState: "IN" })), {
    name: "AttendanceEventConflictError",
  })
  assert.equal(ledger.readings.length, 1)
  assert.equal(ledger.events.length, 1)
})
