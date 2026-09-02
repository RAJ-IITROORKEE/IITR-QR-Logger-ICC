import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import ts from "typescript"
import vm from "node:vm"

const MODULE_PATH = "./lib/realtime-relay-publisher.ts"

function loadPublisher({ relayUrl = "https://relay.example", secret = "p".repeat(32), response = { ok: true, status: 202 } } = {}) {
  const source = readFileSync(MODULE_PATH, "utf8")
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const calls = []
  const cjsModule = { exports: {} }
  vm.runInNewContext(compiled, {
    Buffer,
    AbortController,
    setTimeout,
    clearTimeout,
    URL,
    process: { env: { QR_RELAY_PUBLISH_URL: relayUrl, QR_RELAY_PUBLISH_SECRET: secret } },
    fetch: async (...args) => { calls.push(args); return response },
    exports: cjsModule.exports,
    module: cjsModule,
    require: (specifier) => { throw new Error(`Unexpected module: ${specifier}`) },
  }, { filename: MODULE_PATH })
  return { publish: cjsModule.exports.publishRealtimeAttendanceHint, calls }
}

test("publishes only bounded metadata to the configured HTTPS relay endpoint", async () => {
  const { publish, calls } = loadPublisher()
  await publish(42n, new Date("2026-09-01T12:00:00.000Z"))
  assert.equal(calls.length, 1)
  assert.equal(calls[0][0], "https://relay.example/v1/publish")
  assert.equal(calls[0][1].headers.authorization, `Bearer ${"p".repeat(32)}`)
  assert.deepEqual(JSON.parse(calls[0][1].body), { sequence: "42", changedAt: "2026-09-01T12:00:00.000Z" })
})

test("fails closed without making attendance callers depend on relay configuration", async () => {
  const { publish, calls } = loadPublisher({ relayUrl: "http://relay.example", secret: "short" })
  await publish(42n, new Date())
  assert.equal(calls.length, 0)
})
