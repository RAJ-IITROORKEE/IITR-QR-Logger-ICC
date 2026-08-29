import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import ts from "typescript"
import vm from "node:vm"

const ROUTE_PATH = "./app/api/qr-biometric-icc/changes/route.ts"

function loadRoute({ dashboardAccess = true, sequence = 42n } = {}) {
  const source = readFileSync(ROUTE_PATH, "utf8")
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const calls = { counter: 0 }
  const moduleRequire = (specifier) => {
    if (specifier === "next/server") return { NextResponse: { json: (body, init) => Response.json(body, init) } }
    if (specifier === "@/lib/access-auth") {
      return { ACCESS_SESSION_COOKIE: "access", verifyAccessSession: async () => dashboardAccess }
    }
    if (specifier === "@/lib/admin-auth") {
      return { ADMIN_SESSION_COOKIE: "admin", verifyAdminSession: () => false }
    }
    if (specifier === "@/lib/attendance-device-contract") return { ATTENDANCE_FEED_RETRY_MS: 1_500 }
    if (specifier === "@/lib/prisma") {
      return { prisma: { attendanceFeedCounter: { findUnique: async () => {
        calls.counter++
        return { value: sequence }
      } } } }
    }
    throw new Error(`Unexpected module: ${specifier}`)
  }
  const cjsModule = { exports: {} }
  vm.runInNewContext(compiled, {
    Response,
    console: { error() {} },
    exports: cjsModule.exports,
    module: cjsModule,
    require: moduleRequire,
  }, { filename: ROUTE_PATH })
  return { GET: cjsModule.exports.GET, calls }
}

function request() {
  return { cookies: { get: () => undefined } }
}

test("returns only the current attendance sequence and polling interval", async () => {
  const { GET, calls } = loadRoute()
  const response = await GET(request())

  assert.equal(response.status, 200)
  assert.equal(response.headers.get("cache-control"), "private, no-store")
  assert.deepEqual(await response.json(), { success: true, sequence: "42", retryAfterMs: 1500 })
  assert.equal(calls.counter, 1)
})

test("authenticates before reading the change sequence", async () => {
  const { GET, calls } = loadRoute({ dashboardAccess: false })
  const response = await GET(request())

  assert.equal(response.status, 401)
  assert.deepEqual(await response.json(), { success: false, error: "Unauthorized" })
  assert.equal(calls.counter, 0)
})
