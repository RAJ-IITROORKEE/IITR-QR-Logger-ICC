import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import ts from "typescript"
import vm from "node:vm"

const ROUTE_PATH = "./app/api/qr-biometric-icc/realtime-token/route.ts"

function loadRoute({ dashboardAccess = true, relayUrl = "wss://relay.example/v1/realtime", secret = "s".repeat(64) } = {}) {
  const source = readFileSync(ROUTE_PATH, "utf8")
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const calls = { token: 0 }
  const moduleRequire = (specifier) => {
    if (specifier === "next/server") return { NextResponse: { json: (body, init) => Response.json(body, init) } }
    if (specifier === "@/lib/access-auth") return { ACCESS_SESSION_COOKIE: "access", verifyAccessSession: async () => dashboardAccess }
    if (specifier === "@/lib/admin-auth") return { ADMIN_SESSION_COOKIE: "admin", verifyAdminSession: () => false }
    if (specifier === "@/lib/realtime-relay-token") return { createRealtimeRelayToken: () => { calls.token++; return "signed-token" } }
    throw new Error(`Unexpected module: ${specifier}`)
  }
  const cjsModule = { exports: {} }
  vm.runInNewContext(compiled, {
    Buffer,
    Response,
    URL,
    process: { env: { QR_RELAY_URL: relayUrl, QR_RELAY_TOKEN_SECRET: secret } },
    exports: cjsModule.exports,
    module: cjsModule,
    require: moduleRequire,
  }, { filename: ROUTE_PATH })
  return { GET: cjsModule.exports.GET, calls }
}

const request = () => ({ cookies: { get: () => undefined } })

test("authenticates before issuing a private dashboard relay token", async () => {
  const { GET, calls } = loadRoute({ dashboardAccess: false })
  const response = await GET(request())
  assert.equal(response.status, 401)
  assert.equal(calls.token, 0)
})

test("returns the configured WSS endpoint and short-lived token", async () => {
  const { GET, calls } = loadRoute()
  const response = await GET(request())
  const body = await response.json()
  assert.equal(response.status, 200)
  assert.equal(response.headers.get("cache-control"), "private, no-store")
  assert.equal(body.success, true)
  assert.equal(body.url, "wss://relay.example/v1/realtime")
  assert.equal(body.token, "signed-token")
  assert.equal(typeof body.expiresAt, "string")
  assert.equal(calls.token, 1)
})

test("fails closed when relay configuration is absent or non-WSS", async () => {
  for (const relayUrl of ["", "https://relay.example/v1/realtime"]) {
    const { GET, calls } = loadRoute({ relayUrl })
    const response = await GET(request())
    assert.equal(response.status, 503)
    assert.equal(calls.token, 0)
  }
})
