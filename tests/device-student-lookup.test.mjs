import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import ts from "typescript"
import vm from "node:vm"

const ROUTE_PATH = "./app/api/device/v1/students/lookup/route.ts"
const SERVER_TIME = "2026-08-05T12:00:00.000Z"

function loadLookupRoute({ authResult = { ok: true, device: { deviceId: "TAB5-001" } }, identity = null, projection = null, identityError = null } = {}) {
  const source = readFileSync(ROUTE_PATH, "utf8")
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const calls = { auth: 0, normalize: 0, identity: 0, projection: 0, enrollment: null }
  const moduleRequire = (specifier) => {
    if (specifier === "next/server") return { NextResponse: { json: (body, init) => Response.json(body, init) } }
    if (specifier === "@/lib/attendance-device-auth") {
      return { authenticateAttendanceDevice: async () => {
        calls.auth++
        return authResult
      } }
    }
    if (specifier === "@/lib/attendance-device-contract") {
      return { normalizeEnrollmentKey: (value) => {
        calls.normalize++
        const normalized = typeof value === "string" ? value.trim().toUpperCase() : ""
        return /^[A-Z0-9]{4,24}$/.test(normalized) ? normalized : null
      } }
    }
    if (specifier === "@/lib/qr-biometric-photo") {
      return { isStoredStudentPhotoUrl: (value) => value === "https://store.private.blob.vercel-storage.com/student-photos/photo.jpg" }
    }
    if (specifier === "@/lib/prisma") {
      return { prisma: {
        studentIdentity: {
          findUnique: async ({ where }) => {
            calls.identity++
            calls.enrollment = where.enrollmentKey
            if (identityError) throw identityError
            return identity
          },
        },
        attendanceProjection: {
          findUnique: async () => {
            calls.projection++
            return projection
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
  vm.runInNewContext(compiled, { Date: FixedDate, Response, URL, console: { error() {} }, exports: cjsModule.exports, module: cjsModule, require: moduleRequire }, { filename: ROUTE_PATH })
  return { GET: cjsModule.exports.GET, calls }
}

function request(enrollment) {
  return new Request(`https://device.test/api/device/v1/students/lookup?enrollment=${encodeURIComponent(enrollment)}`, {
    headers: { authorization: "Bearer test", "x-device-id": "TAB5-001" },
  })
}

async function assertPrivateResponse(response, status) {
  assert.equal(response.status, status)
  assert.equal(response.headers.get("cache-control"), "private, no-store")
  assert.equal(response.headers.get("vary"), "Authorization, X-Device-Id")
}

test("authenticates before validating or querying a lookup", async () => {
  const { GET, calls } = loadLookupRoute({ authResult: { ok: false, status: 401, error: "Invalid device credentials" } })
  const response = await GET(request("not/valid"))

  await assertPrivateResponse(response, 401)
  assert.deepEqual(await response.json(), { success: false, error: "Invalid device credentials" })
  assert.deepEqual(calls, { auth: 1, normalize: 0, identity: 0, projection: 0, enrollment: null })
})

test("normalizes enrollment after authentication and returns only Tab5 display fields", async () => {
  const { GET, calls } = loadLookupRoute({
    identity: {
      id: "0123456789abcdefabcdef01",
      enrollmentNo: "24115114",
      fullName: "Ada Student",
      photoVersion: 3,
      studentPhotoUrl: "https://store.private.blob.vercel-storage.com/student-photos/photo.jpg",
      doswUrl: "https://sensitive.example/student",
      profile: { email: "ada@example.test" },
    },
    projection: { currentState: "IN", latestOccurredAt: new Date("2026-08-05T11:55:00.000Z") },
  })
  const response = await GET(request(" 24115114 "))

  await assertPrivateResponse(response, 200)
  assert.deepEqual(await response.json(), {
    success: true,
    schemaVersion: 1,
    student: {
      identityId: "0123456789abcdefabcdef01",
      name: "Ada Student",
      enrollment: "24115114",
      photoVersion: 3,
      photoPath: "/api/device/v1/photos/0123456789abcdefabcdef01?v=3",
    },
    attendance: { currentState: "IN", latestOccurredAt: "2026-08-05T11:55:00.000Z" },
    serverTime: SERVER_TIME,
  })
  assert.equal(calls.enrollment, "24115114")
  assert.equal(calls.projection, 1)
})

test("rejects invalid enrollment after authentication without querying", async () => {
  const { GET, calls } = loadLookupRoute()
  const response = await GET(request("24/115114"))

  await assertPrivateResponse(response, 400)
  assert.deepEqual(await response.json(), { success: false, error: "Invalid enrollment" })
  assert.equal(calls.auth, 1)
  assert.equal(calls.identity, 0)
})

test("returns a generic not-found response and never exposes an invalid photo URL", async () => {
  const missing = loadLookupRoute()
  const missingResponse = await missing.GET(request("24115114"))
  await assertPrivateResponse(missingResponse, 404)
  assert.deepEqual(await missingResponse.json(), { success: false, error: "Student not found" })
  assert.equal(missing.calls.projection, 0)

  const { GET } = loadLookupRoute({
    identity: {
      id: "0123456789abcdefabcdef01",
      enrollmentNo: "24115114",
      fullName: null,
      photoVersion: 4,
      studentPhotoUrl: "https://dosw.iitr.ac.in/photo?enrollment=24115114",
    },
  })
  const response = await GET(request("24115114"))
  await assertPrivateResponse(response, 200)
  const body = await response.json()
  assert.equal(body.student.photoPath, null)
  assert.equal(JSON.stringify(body).includes("dosw.iitr.ac.in"), false)
})

test("maps database failures to a generic unavailable response", async () => {
  const { GET } = loadLookupRoute({ identityError: new Error("database connection details") })
  const response = await GET(request("24115114"))

  await assertPrivateResponse(response, 503)
  assert.deepEqual(await response.json(), { success: false, error: "Student lookup temporarily unavailable" })
})
