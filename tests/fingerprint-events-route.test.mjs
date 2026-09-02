import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import ts from "typescript"
import vm from "node:vm"

const ROUTE = "./app/api/device/v1/fingerprint/events/route.ts"

function loadRoute() {
  const source = readFileSync(ROUTE, "utf8")
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const moduleRequire = (specifier) => {
    if (specifier === "next/server") return { after: () => {}, NextResponse: { json: (body, init) => Response.json(body, init) } }
    if (specifier === "@/lib/attendance-device-auth") return { authenticateAttendanceDevice: async () => ({ ok: true, device: { deviceId: "TAB5-001" } }) }
    if (specifier === "@/lib/fingerprint-device-contract") return {
      ATTENDANCE_BATCH_MAX_BYTES: 32 * 1024,
      parseFingerprintEventBatch: (body) => ({ ok: true, value: body }),
    }
    if (specifier === "@/lib/attendance-ledger") return {
      AttendanceEventConflictError: class AttendanceEventConflictError extends Error {},
      recordFingerprintAttendanceBatch: async () => [{ eventId: "event-1", status: "PENDING_FINGERPRINT_MAPPING", replayed: false }],
    }
    if (specifier === "@/lib/prisma") return { prisma: { attendanceFeedCounter: { findUnique: async () => null } } }
    if (specifier === "@/lib/realtime-relay-publisher") return { publishRealtimeAttendanceHint: async () => {} }
    throw new Error(`Unexpected module: ${specifier}`)
  }
  const cjsModule = { exports: {} }
  vm.runInNewContext(compiled, {
    Buffer,
    Date,
    Response,
    console: { error() {} },
    exports: cjsModule.exports,
    module: cjsModule,
    require: moduleRequire,
  }, { filename: ROUTE })
  return cjsModule.exports.POST
}

test("fingerprint event receiver is authenticated and exposes pending mapping results", async () => {
  const POST = loadRoute()
  const response = await POST(new Request("https://device.test/api/device/v1/fingerprint/events", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ schemaVersion: 1, events: [{ eventId: "event-1" }] }),
  }))
  assert.equal(response.status, 200)
  const body = await response.json()
  assert.equal(body.success, true)
  assert.equal(body.results[0].status, "PENDING_FINGERPRINT_MAPPING")
})
