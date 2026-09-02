import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import ts from "typescript"
import vm from "node:vm"

const ROUTE_PATH = "./app/api/device/v1/feed/route.ts"
const SERVER_TIME = "2026-08-05T12:00:00.000Z"

function change(sequence, kind, snapshot, audienceDeviceId = null) {
  return {
    id: `private-db-id-${sequence}`,
    sequence: BigInt(sequence),
    kind,
    snapshot,
    audienceDeviceId,
    attendanceEventId: `private-event-link-${sequence}`,
    createdAt: new Date(`2026-08-05T11:59:${String(sequence).padStart(2, "0")}.000Z`),
  }
}

function loadFeedRoute({
  authResult = { ok: true, device: { deviceId: "TAB5-001" } },
  currentSequence = 0n,
  oldestRelevant = null,
  latestSnapshot = null,
  latestGlobalChange = latestSnapshot,
  changes = [],
} = {}) {
  const source = readFileSync(ROUTE_PATH, "utf8")
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const calls = { auth: 0, after: 0, counter: 0, findFirst: [], findMany: [] }
  const moduleRequire = (specifier) => {
    if (specifier === "next/server") {
      return {
        NextResponse: { json: (body, init) => Response.json(body, init) },
        after: () => { calls.after++ },
      }
    }
    if (specifier === "@/lib/attendance-device-auth") {
      return { authenticateAttendanceDevice: async () => {
        calls.auth++
        return authResult
      } }
    }
    if (specifier === "@/lib/attendance-device-contract") {
      return {
        ATTENDANCE_FEED_RETRY_MS: 1_500,
        encodeAttendanceCursor: (sequence) => `cursor-${sequence}`,
        decodeAttendanceCursor: (cursor) => /^cursor-(0|[1-9][0-9]*)$/.test(cursor) ? BigInt(cursor.slice(7)) : null,
        advanceAttendanceCursor: (current, delivered) => delivered.reduce((highest, sequence) => sequence > highest ? sequence : highest, current),
      }
    }
    if (specifier === "@/lib/attendance-ledger") {
      return { reconcilePendingCanonicalReadings: async () => 0 }
    }
    if (specifier === "@/lib/prisma") {
      return { prisma: {
        attendanceFeedCounter: {
          findUnique: async () => {
            calls.counter++
            return { value: currentSequence }
          },
        },
        attendanceChange: {
          findFirst: async (query) => {
            calls.findFirst.push(query)
            if (query.select?.sequence) return oldestRelevant
            return query.where?.kind === "LATEST_SNAPSHOT" ? latestSnapshot : latestGlobalChange
          },
          findMany: async (query) => {
            calls.findMany.push(query)
            return changes
          },
        },
      } }
    }
    throw new Error(`Unexpected module: ${specifier}`)
  }
  class FixedDate extends Date {
    constructor(value) {
      super(value === undefined ? SERVER_TIME : value)
    }
    static now() {
      return new Date(SERVER_TIME).getTime()
    }
  }
  const cjsModule = { exports: {} }
  vm.runInNewContext(compiled, {
    Date: FixedDate,
    Response,
    URL,
    console: { error() {} },
    exports: cjsModule.exports,
    module: cjsModule,
    require: moduleRequire,
  }, { filename: ROUTE_PATH })
  return { GET: cjsModule.exports.GET, calls }
}

function request(cursor = "cursor-0", limit = 20) {
  const query = new URLSearchParams({ cursor, limit: String(limit) })
  return new Request(`https://device.test/api/device/v1/feed?${query}`, {
    headers: { authorization: "Bearer test", "x-device-id": "TAB5-001" },
  })
}

async function assertPrivateResponse(response, status = 200) {
  assert.equal(response.status, status)
  assert.equal(response.headers.get("cache-control"), "private, no-store")
  assert.equal(response.headers.get("vary"), "Authorization, X-Device-Id")
}

test("a non-reset feed self-heals with the authoritative latest global snapshot after its cursor passed it", async () => {
  const authoritative = change(8, "LATEST_SNAPSHOT", {
    event: { eventId: "qr:new", occurredAt: "2026-08-05T11:58:00.000Z", entryState: "IN", sourceType: "QR", status: "APPLIED" },
    student: { identityId: "student-1", name: "Ada Student", enrollment: "24115114", photoVersion: 1, photoPath: null },
    projectionVersion: 2,
  })
  const correction = change(9, "PROJECTION_CORRECTED", { privateReason: "must not replace latest snapshot" })
  const { GET, calls } = loadFeedRoute({ currentSequence: 12n, latestSnapshot: authoritative, latestGlobalChange: correction })

  const response = await GET(request("cursor-12"))

  await assertPrivateResponse(response)
  const body = await response.json()
  assert.equal(body.reset, false)
  assert.equal(body.cursor, "cursor-12")
  assert.equal(body.hasMore, false)
  assert.equal(body.serverTime, SERVER_TIME)
  assert.deepEqual(body.changes, [{
    sequence: "8",
    kind: "LATEST_SNAPSHOT",
    snapshot: authoritative.snapshot,
    createdAt: "2026-08-05T11:59:08.000Z",
  }])
  assert.equal(JSON.stringify(body).includes("private-db-id"), false)
  assert.equal(JSON.stringify(body).includes("private-event-link"), false)
  assert.equal(calls.findFirst.some((query) => query.where?.audienceDeviceId === null && query.where?.kind === "LATEST_SNAPSHOT"), true)
})

test("snapshot healing preserves a targeted event page and does not advance its paging cursor", async () => {
  const status = change(6, "EVENT_STATUS", { eventId: "manual-1", status: "APPLIED", effectiveState: "IN", replayed: false }, "TAB5-001")
  const nextTargeted = change(7, "EVENT_STATUS", { eventId: "manual-2", status: "APPLIED", effectiveState: "OUT", replayed: false }, "TAB5-001")
  const authoritative = change(19, "LATEST_SNAPSHOT", { event: { eventId: "qr-latest" }, student: { identityId: "student-2" } })
  const { GET, calls } = loadFeedRoute({ currentSequence: 20n, latestSnapshot: authoritative, changes: [status, nextTargeted] })

  const response = await GET(request("cursor-5", 1))

  await assertPrivateResponse(response)
  const body = await response.json()
  assert.equal(body.reset, false)
  assert.equal(body.hasMore, true)
  assert.equal(body.cursor, "cursor-6")
  assert.deepEqual(body.changes.map(({ sequence, kind }) => ({ sequence, kind })), [
    { sequence: "6", kind: "EVENT_STATUS" },
    { sequence: "19", kind: "LATEST_SNAPSHOT" },
  ])
  assert.equal(calls.findMany[0].take, 2)
  assert.equal(calls.findMany[0].where.AND[1].OR[1].audienceDeviceId, "TAB5-001")
})

test("does not duplicate the authoritative snapshot when it is already in the page", async () => {
  const authoritative = change(9, "LATEST_SNAPSHOT", { event: { eventId: "qr-latest" }, student: { identityId: "student-2" } })
  const { GET } = loadFeedRoute({ currentSequence: 10n, latestSnapshot: authoritative, changes: [authoritative] })

  const response = await GET(request("cursor-8"))

  await assertPrivateResponse(response)
  const body = await response.json()
  assert.equal(body.cursor, "cursor-10")
  assert.equal(body.hasMore, false)
  assert.deepEqual(body.changes.map((item) => item.sequence), ["9"])
})

test("an initial reset returns the latest LATEST_SNAPSHOT instead of a newer global change", async () => {
  const authoritative = change(8, "LATEST_SNAPSHOT", { event: { eventId: "qr-latest" } })
  const correction = change(9, "PROJECTION_CORRECTED", { privateReason: "not display state" })
  const { GET, calls } = loadFeedRoute({ currentSequence: 9n, latestSnapshot: authoritative, latestGlobalChange: correction })

  const response = await GET(request("cursor-12"))

  await assertPrivateResponse(response)
  const body = await response.json()
  assert.equal(body.reset, true)
  assert.equal(body.cursor, "cursor-9")
  assert.deepEqual(body.changes.map(({ sequence, kind }) => ({ sequence, kind })), [
    { sequence: "8", kind: "LATEST_SNAPSHOT" },
  ])
  assert.equal(calls.findFirst.some((query) => query.where?.kind === "LATEST_SNAPSHOT"), true)
})

test("a retention-gap reset returns the latest LATEST_SNAPSHOT instead of a newer global change", async () => {
  const authoritative = change(18, "LATEST_SNAPSHOT", { event: { eventId: "manual-latest" } })
  const correction = change(19, "PROJECTION_CORRECTED", { privateReason: "not display state" })
  const { GET } = loadFeedRoute({
    currentSequence: 20n,
    oldestRelevant: { sequence: 10n },
    latestSnapshot: authoritative,
    latestGlobalChange: correction,
  })

  const response = await GET(request("cursor-2"))

  await assertPrivateResponse(response)
  const body = await response.json()
  assert.equal(body.reset, true)
  assert.equal(body.cursor, "cursor-20")
  assert.deepEqual(body.changes.map(({ sequence, kind }) => ({ sequence, kind })), [
    { sequence: "18", kind: "LATEST_SNAPSHOT" },
  ])
})

test("authenticates before accessing feed state", async () => {
  const { GET, calls } = loadFeedRoute({ authResult: { ok: false, status: 401, error: "Invalid device credentials" } })

  const response = await GET(request("not-a-cursor"))

  await assertPrivateResponse(response, 401)
  assert.deepEqual(await response.json(), { success: false, error: "Invalid device credentials" })
  assert.equal(calls.auth, 1)
  assert.equal(calls.counter, 0)
  assert.equal(calls.findMany.length, 0)
})
