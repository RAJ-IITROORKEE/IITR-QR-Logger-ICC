import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import ts from "typescript"
import vm from "node:vm"

const SERVER_TIME = "2026-09-02T12:00:00.000Z"

function loadRoute(path, { authResult = { ok: true }, students = [], events = [] } = {}) {
  const source = readFileSync(path, "utf8")
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const calls = { auth: 0, students: [], events: [] }
  const moduleRequire = (specifier) => {
    if (specifier === "next/server") return { NextResponse: { json: (body, init) => Response.json(body, init) } }
    if (specifier === "@/lib/attendance-device-auth") return { authenticateAttendanceDevice: async () => { calls.auth++; return authResult } }
    if (specifier === "@/lib/attendance-device-contract") return {
      normalizeEnrollmentKey: (value) => {
        const normalized = typeof value === "string" ? value.trim().toUpperCase() : ""
        return /^[A-Z0-9]{4,24}$/.test(normalized) ? normalized : null
      },
    }
    if (specifier === "@/lib/prisma") return { prisma: {
      studentIdentity: { findMany: async (query) => { calls.students.push(query); return students } },
      attendanceEvent: { findMany: async (query) => { calls.events.push(query); return events } },
    } }
    throw new Error(`Unexpected module: ${specifier}`)
  }
  class FixedDate extends Date {
    constructor(value) { super(value === undefined ? SERVER_TIME : value) }
    static now() { return new Date(SERVER_TIME).getTime() }
  }
  const cjsModule = { exports: {} }
  vm.runInNewContext(compiled, { Date: FixedDate, Response, URL, console: { error() {} }, exports: cjsModule.exports, module: cjsModule, require: moduleRequire }, { filename: path })
  return { GET: cjsModule.exports.GET, calls }
}

function request(path) {
  return new Request(`https://device.test${path}`, { headers: { authorization: "Bearer test", "x-device-id": "TAB5-001" } })
}

async function assertPrivate(response, status) {
  assert.equal(response.status, status)
  assert.equal(response.headers.get("cache-control"), "private, no-store")
  assert.equal(response.headers.get("vary"), "Authorization, X-Device-Id")
}

test("student search authenticates first and returns a minimal fixed enrollment-prefix result", async () => {
  const path = "./app/api/device/v1/students/search/route.ts"
  const denied = loadRoute(path, { authResult: { ok: false, status: 401, error: "Invalid device credentials" } })
  await assertPrivate(await denied.GET(request("/api/device/v1/students/search?q=bad/")), 401)
  assert.deepEqual(denied.calls, { auth: 1, students: [], events: [] })

  const route = loadRoute(path, { students: [{ enrollmentNo: "24115114", fullName: "Ada Student", profile: { email: "hidden" } }] })
  const response = await route.GET(request("/api/device/v1/students/search?q= 2411 "))
  await assertPrivate(response, 200)
  assert.deepEqual(await response.json(), {
    success: true,
    schemaVersion: 1,
    students: [{ enrollment: "24115114", name: "Ada Student" }],
    serverTime: SERVER_TIME,
  })
  assert.deepEqual(JSON.parse(JSON.stringify(route.calls.students[0])), {
    where: { enrollmentKey: { startsWith: "2411" } },
    orderBy: { enrollmentKey: "asc" },
    take: 10,
    select: { enrollmentNo: true, fullName: true },
  })
})

test("student search rejects invalid prefixes without querying", async () => {
  const route = loadRoute("./app/api/device/v1/students/search/route.ts")
  const response = await route.GET(request("/api/device/v1/students/search?q=ABC"))
  await assertPrivate(response, 400)
  assert.deepEqual(await response.json(), { success: false, error: "Invalid enrollment prefix" })
  assert.equal(route.calls.students.length, 0)
})

test("student history returns only bounded applied transitions", async () => {
  const route = loadRoute("./app/api/device/v1/students/history/route.ts", {
    events: [
      { occurredAt: new Date("2026-09-02T11:00:00.000Z"), effectiveState: "IN", sourceType: "TAB5_MANUAL", eventId: "hidden" },
      { occurredAt: new Date("2026-09-02T10:00:00.000Z"), effectiveState: "OUT", sourceType: "QR", eventId: "hidden" },
      { occurredAt: new Date("2026-09-02T09:00:00.000Z"), effectiveState: "IN", sourceType: "FINGERPRINT", eventId: "hidden" },
    ],
  })
  const response = await route.GET(request("/api/device/v1/students/history?enrollment=24115114&limit=2"))
  await assertPrivate(response, 200)
  assert.deepEqual(await response.json(), {
    success: true,
    schemaVersion: 1,
    enrollment: "24115114",
    hasMore: true,
    history: [
      { occurredAt: "2026-09-02T11:00:00.000Z", entryState: "IN", source: "TAB5_MANUAL" },
      { occurredAt: "2026-09-02T10:00:00.000Z", entryState: "OUT", source: "QR" },
    ],
    serverTime: SERVER_TIME,
  })
  assert.deepEqual(JSON.parse(JSON.stringify(route.calls.events[0])), {
    where: { enrollmentKey: "24115114", status: "APPLIED" },
    orderBy: { occurredAt: "desc" },
    take: 3,
    select: { occurredAt: true, effectiveState: true, sourceType: true },
  })
})

test("student history validates input and caps limit without querying first", async () => {
  const route = loadRoute("./app/api/device/v1/students/history/route.ts")
  const invalid = await route.GET(request("/api/device/v1/students/history?enrollment=bad/&limit=1000"))
  await assertPrivate(invalid, 400)
  assert.equal(route.calls.events.length, 0)

  const capped = await route.GET(request("/api/device/v1/students/history?enrollment=24115114&limit=1000"))
  await assertPrivate(capped, 200)
  assert.equal(route.calls.events[0].take, 51)
})
