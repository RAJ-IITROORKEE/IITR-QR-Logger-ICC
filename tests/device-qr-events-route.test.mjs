import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import test from "node:test"
import ts from "typescript"
import vm from "node:vm"

const ROUTE = "./app/api/device/v1/qr-events/route.ts"
const QR_URL = "https://dosw.iitr.ac.in/StudentProxy.aspx?id=student-1"

function loadRoute({ auth = { ok: true, device: { deviceId: "TAB5-001" } }, existing = null, canonicalStatus = "APPLIED", profile = { enrollmentNo: "24115114", fullName: "Ada Student" } } = {}) {
  const source = readFileSync(ROUTE, "utf8")
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  let created = 0
  let canonicalCalls = 0
  let profileFetches = 0
  const conflict = class AttendanceEventConflictError extends Error {}
  const moduleRequire = (specifier) => {
    if (specifier === "node:crypto") return { createHash }
    if (specifier === "next/server") return { NextResponse: { json: (body, init) => Response.json(body, init) } }
    if (specifier === "@/lib/attendance-device-auth") return { authenticateAttendanceDevice: async () => auth }
    if (specifier === "@/lib/attendance-ledger") return {
      AttendanceEventConflictError: conflict,
      recordCanonicalQrAttendance: async () => {
        canonicalCalls += 1
        return { status: canonicalStatus, effectiveState: "IN" }
      },
    }
    if (specifier === "@/lib/qr-biometric-student") return {
      isDoswStudentUrl: (value) => value.startsWith("https://dosw.iitr.ac.in/StudentProxy.aspx?id="),
      normalizeDecodedUrl: (value) => typeof value === "string" ? value.trim() : null,
      extractStudentInfo: () => profile,
    }
    if (specifier === "@/lib/prisma") return {
      prisma: {
        qrBiometricReading: {
          findUnique: async () => existing,
          create: async () => { created += 1; return {} },
        },
        studentIdentity: {
          findUnique: async () => null,
        },
      },
    }
    throw new Error(`Unexpected module: ${specifier}`)
  }
  const module = { exports: {} }
  vm.runInNewContext(compiled, {
    Buffer,
    Date,
    Request,
    Response,
    URL,
    clearTimeout,
    AbortController,
    console: { error() {} },
    createHash,
    fetch: async () => {
      profileFetches += 1
      return new Response("<html></html>", { status: profile ? 200 : 503, headers: { "content-type": "text/html" } })
    },
    exports: module.exports,
    module,
    require: moduleRequire,
    setTimeout,
  }, { filename: ROUTE })
  return { POST: module.exports.POST, stats: () => ({ created, canonicalCalls, profileFetches }) }
}

function request(body, headers = {}) {
  return new Request("https://device.test/api/device/v1/qr-events", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer test", "x-device-id": "TAB5-001", ...headers },
    body: JSON.stringify(body),
  })
}

const validBody = { schemaVersion: 1, scanId: "scan-1", decodedData: QR_URL }

test("QR event authenticates before validating or touching storage", async () => {
  let route = loadRoute({ auth: { ok: false, error: "Invalid device credentials", status: 401 } })
  let response = await route.POST(request({ schemaVersion: 99 }))
  assert.equal(response.status, 401)

  route = loadRoute()
  response = await route.POST(request({ ...validBody, decodedData: "https://example.com/not-a-student" }))
  assert.equal(response.status, 400)
  assert.equal(route.stats().created, 0)
})

test("first QR event is canonical and replay is idempotent", async () => {
  const route = loadRoute()
  let response = await route.POST(request(validBody))
  assert.equal(response.status, 200)
  assert.equal((await response.json()).status, "APPLIED")
  assert.deepEqual(route.stats(), { created: 1, canonicalCalls: 1, profileFetches: 1 })

  const replay = loadRoute({ existing: {
    id: "same", deviceId: "TAB5-001", decodedData: QR_URL, createdAt: new Date(),
    studentInfo: { enrollmentNo: "24115114", fullName: "Ada Student" },
  } })
  response = await replay.POST(request(validBody))
  assert.equal(response.status, 200)
  assert.equal((await response.json()).replayed, true)
  assert.equal(replay.stats().created, 0)
  assert.equal(replay.stats().profileFetches, 0)
})

test("profile failure is retryable and does not create attendance", async () => {
  const route = loadRoute({ profile: null })
  const response = await route.POST(request(validBody))
  assert.equal(response.status, 503)
  assert.equal(route.stats().created, 0)
})

test("body schema and scan-id validation are rejected", async () => {
  const route = loadRoute()
  let response = await route.POST(request({ schemaVersion: 2, scanId: "scan-1", decodedData: QR_URL }))
  assert.equal(response.status, 400)
  response = await route.POST(request({ schemaVersion: 1, scanId: "bad id", decodedData: QR_URL }))
  assert.equal(response.status, 400)
})
