import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import ts from "typescript"
import vm from "node:vm"

const ROUTE = "./app/api/device/v1/feed/route.ts"

function loadRoute() {
  const source = readFileSync(ROUTE, "utf8")
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const snapshot = {
    sequence: 8n,
    kind: "LATEST_SNAPSHOT",
    snapshot: { event: { eventId: "qr-latest" }, student: { enrollment: "24115114" } },
    audienceDeviceId: null,
    createdAt: new Date("2026-08-05T11:59:08.000Z"),
  }
  const moduleRequire = (specifier) => {
    if (specifier === "next/server") return { NextResponse: { json: (body, init) => Response.json(body, init) }, after() {} }
    if (specifier === "@/lib/attendance-device-auth") return { authenticateAttendanceDevice: async () => ({ ok: true, device: { deviceId: "TAB5-001" } }) }
    if (specifier === "@/lib/attendance-ledger") return { reconcilePendingCanonicalReadings: async () => 0 }
    if (specifier === "@/lib/attendance-device-contract") return {
      ATTENDANCE_FEED_RETRY_MS: 1500,
      decodeAttendanceCursor: (value) => value === "cursor-12" ? 12n : null,
      encodeAttendanceCursor: (value) => `cursor-${value}`,
      advanceAttendanceCursor: (current) => current,
    }
    if (specifier === "@/lib/prisma") return { prisma: {
      attendanceFeedCounter: { findUnique: async () => ({ value: 12n }) },
      attendanceChange: {
        findFirst: async (query) => query.where?.kind === "LATEST_SNAPSHOT" ? snapshot : null,
        findMany: async () => [],
      },
    } }
    throw new Error(`Unexpected module: ${specifier}`)
  }
  const module = { exports: {} }
  vm.runInNewContext(compiled, {
    Date,
    Response,
    URL,
    console: { error() {} },
    exports: module.exports,
    module,
    require: moduleRequire,
  }, { filename: ROUTE })
  return module.exports.GET
}

test("non-reset feed returns the authoritative latest snapshot after cursor advancement", async () => {
  const response = await loadRoute()(new Request("https://device.test/api/device/v1/feed?cursor=cursor-12"))
  assert.equal(response.status, 200)
  assert.equal(response.headers.get("cache-control"), "private, no-store")
  assert.deepEqual((await response.json()).changes.map((change) => change.kind), ["LATEST_SNAPSHOT"])
})
