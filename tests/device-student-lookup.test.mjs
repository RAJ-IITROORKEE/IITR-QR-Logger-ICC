import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import ts from "typescript"
import vm from "node:vm"

const ROUTE = "./app/api/device/v1/students/lookup/route.ts"

function loadRoute(identity = null) {
  const source = readFileSync(ROUTE, "utf8")
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const moduleRequire = (specifier) => {
    if (specifier === "next/server") return { NextResponse: { json: (body, init) => Response.json(body, init) } }
    if (specifier === "@/lib/attendance-device-auth") return { authenticateAttendanceDevice: async () => ({ ok: true, device: { deviceId: "TAB5-001" } }) }
    if (specifier === "@/lib/attendance-device-contract") return { normalizeEnrollmentKey: (value) => typeof value === "string" && /^[0-9]{4,24}$/.test(value.trim()) ? value.trim() : null }
    if (specifier === "@/lib/qr-biometric-photo") return { isStoredStudentPhotoUrl: () => false }
    if (specifier === "@/lib/prisma") return { prisma: {
      studentIdentity: { findUnique: async () => identity },
      attendanceProjection: { findUnique: async () => null },
    } }
    throw new Error(`Unexpected module: ${specifier}`)
  }
  const module = { exports: {} }
  vm.runInNewContext(compiled, { Date, Response, URL, console: { error() {} }, exports: module.exports, module, require: moduleRequire }, { filename: ROUTE })
  return module.exports.GET
}

function request(enrollment) {
  return new Request(`https://device.test/api/device/v1/students/lookup?enrollment=${encodeURIComponent(enrollment)}`, {
    headers: { authorization: "Bearer test", "x-device-id": "TAB5-001" },
  })
}

test("lookup returns top-level attendance and no direct profile URL", async () => {
  const GET = loadRoute({ id: "0123456789abcdefabcdef01", enrollmentNo: "24115114", fullName: "Ada Student", photoVersion: 1, studentPhotoUrl: null })
  const response = await GET(request(" 24115114 "))
  const body = await response.json()
  assert.equal(response.status, 200)
  assert.equal(body.student.enrollment, "24115114")
  assert.deepEqual(body.attendance, { currentState: "OUT", latestOccurredAt: null })
  assert.equal("attendance" in body.student, false)
  assert.equal("studentPhotoUrl" in body.student, false)
})

test("lookup returns a generic not-found response", async () => {
  const response = await loadRoute()(request("24115114"))
  assert.equal(response.status, 404)
  assert.deepEqual(await response.json(), { success: false, error: "Student not found" })
})
