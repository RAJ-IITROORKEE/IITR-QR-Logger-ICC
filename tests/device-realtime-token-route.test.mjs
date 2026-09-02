import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import ts from "typescript"
import vm from "node:vm"

const ROUTE_PATH = "./app/api/device/v1/realtime-token/route.ts"
const NOW = "2026-08-05T12:00:00.000Z"

function loadRoute({
  authResult = { ok: true, device: { deviceId: "TAB5-001", deviceKind: "TAB5_DISPLAY" } },
  relayUrl = "wss://relay.example/v1/realtime",
  secret = "s".repeat(64),
} = {}) {
  const source = readFileSync(ROUTE_PATH, "utf8")
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const calls = { auth: [], token: [] }
  const moduleRequire = (specifier) => {
    if (specifier === "next/server") return { NextResponse: { json: (body, init) => Response.json(body, init) } }
    if (specifier === "@/lib/attendance-device-auth") return {
      authenticateAttendanceDevice: async (...args) => {
        calls.auth.push(args)
        return authResult
      },
    }
    if (specifier === "@/lib/realtime-relay-token") return {
      createRealtimeRelayToken: (...args) => {
        calls.token.push(args)
        return "display-token"
      },
    }
    throw new Error(`Unexpected module: ${specifier}`)
  }
  class FixedDate extends Date {
    constructor(value) { super(value === undefined ? NOW : value) }
    static now() { return new Date(NOW).getTime() }
  }
  const cjsModule = { exports: {} }
  vm.runInNewContext(compiled, {
    Buffer,
    Date: FixedDate,
    Response,
    URL,
    console: { error() {} },
    process: { env: { QR_RELAY_URL: relayUrl, QR_RELAY_TOKEN_SECRET: secret } },
    exports: cjsModule.exports,
    module: cjsModule,
    require: moduleRequire,
  }, { filename: ROUTE_PATH })
  return { GET: cjsModule.exports.GET, calls }
}

function request() {
  return new Request("https://device.test/api/device/v1/realtime-token", {
    headers: { authorization: "Bearer device-secret", "x-device-id": "TAB5-001" },
  })
}

async function assertPrivate(response, status) {
  assert.equal(response.status, status)
  assert.equal(response.headers.get("cache-control"), "private, no-store")
  assert.equal(response.headers.get("vary"), "Authorization, X-Device-Id")
}

test("authenticates a TAB5 display before reading relay configuration", async () => {
  const { GET, calls } = loadRoute({
    authResult: { ok: false, status: 403, error: "Device is not authorized for this endpoint" },
    relayUrl: "not-a-url",
    secret: "short",
  })

  const response = await GET(request())

  await assertPrivate(response, 403)
  assert.deepEqual(await response.json(), { success: false, error: "Device is not authorized for this endpoint" })
  assert.equal(calls.auth.length, 1)
  assert.deepEqual(Array.from(calls.auth[0][1]), ["TAB5_DISPLAY"])
  assert.equal(calls.token.length, 0)
})

test("issues a short-lived display relay token with protocol metadata", async () => {
  const secret = "z".repeat(32)
  const { GET, calls } = loadRoute({ secret })

  const response = await GET(request())

  await assertPrivate(response, 200)
  assert.deepEqual(await response.json(), {
    success: true,
    url: "wss://relay.example/v1/realtime",
    token: "display-token",
    expiresAt: "2026-08-05T12:01:00.000Z",
    protocolVersion: 1,
  })
  assert.equal(calls.token.length, 1)
  assert.equal(calls.token[0][0], secret)
  assert.equal(calls.token[0][1], "display")
  assert.equal(calls.token[0][2], new Date(NOW).getTime())
})

test("fails closed for invalid, credential-bearing, or insecure relay configuration", async () => {
  const invalidConfigurations = [
    { relayUrl: "https://relay.example/v1/realtime" },
    { relayUrl: "wss://user:password@relay.example/v1/realtime" },
    { relayUrl: "not-a-url" },
    { secret: "x".repeat(31) },
    { secret: "é".repeat(15) },
  ]
  for (const config of invalidConfigurations) {
    const { GET, calls } = loadRoute(config)
    const response = await GET(request())
    await assertPrivate(response, 503)
    assert.deepEqual(await response.json(), { success: false, error: "Realtime relay unavailable" })
    assert.equal(calls.token.length, 0)
  }
})
