import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import ts from "typescript"
import vm from "node:vm"

const TOKEN_PATH = "./lib/realtime-relay-token.ts"

function loadTokenModule() {
  const source = readFileSync(TOKEN_PATH, "utf8")
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const cjsModule = { exports: {} }
  vm.runInNewContext(compiled, {
    Buffer,
    Date,
    exports: cjsModule.exports,
    module: cjsModule,
    require: (specifier) => specifier === "crypto" ? awaitCrypto : (() => { throw new Error(`Unexpected module: ${specifier}`) })(),
  }, { filename: TOKEN_PATH })
  return cjsModule.exports
}

const awaitCrypto = await import("node:crypto")

test("dashboard relay tokens are signed, audience-bound, and short-lived", () => {
  const { createRealtimeRelayToken, verifyRealtimeRelayToken } = loadTokenModule()
  const secret = "s".repeat(64)
  const issuedAtMs = Date.parse("2026-08-30T12:00:00.000Z")
  const token = createRealtimeRelayToken(secret, "dashboard", issuedAtMs, "fixed-nonce")

  const verified = verifyRealtimeRelayToken(token, secret, "dashboard", issuedAtMs + 30_000)
  assert.equal(verified?.aud, "qr-realtime-relay")
  assert.equal(verified?.role, "dashboard")
  assert.equal(verified?.nonce, "fixed-nonce")
  assert.equal(verifyRealtimeRelayToken(token, secret, "display", issuedAtMs + 30_000), null)
  assert.equal(verifyRealtimeRelayToken(token, secret, "dashboard", issuedAtMs + 61_000), null)
})

test("relay token verification rejects tampering and weak secrets", () => {
  const { createRealtimeRelayToken, verifyRealtimeRelayToken } = loadTokenModule()
  const secret = "x".repeat(64)
  assert.throws(() => createRealtimeRelayToken("too-short", "dashboard"), /32 bytes/)
  const token = createRealtimeRelayToken(secret, "dashboard", 1_000, "nonce")
  assert.equal(verifyRealtimeRelayToken(`${token.slice(0, -1)}x`, secret, "dashboard", 1_100), null)
})
