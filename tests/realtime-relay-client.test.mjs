import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import ts from "typescript"
import vm from "node:vm"

function loadModule() {
  const path = "./lib/realtime-relay-client.ts"
  const source = readFileSync(path, "utf8")
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const cjsModule = { exports: {} }
  vm.runInNewContext(compiled, { exports: cjsModule.exports, module: cjsModule }, { filename: path })
  return cjsModule.exports
}

test("accepts only versioned ready and attendance change notifications", () => {
  const { parseRealtimeRelayMessage } = loadModule()
  assert.equal(parseRealtimeRelayMessage(JSON.stringify({ v: 1, type: "ready", role: "dashboard" }))?.type, "ready")
  assert.equal(parseRealtimeRelayMessage(JSON.stringify({ v: 1, type: "attendance.changed", scanId: "a".repeat(24) }))?.type, "attendance.changed")
  assert.equal(parseRealtimeRelayMessage(JSON.stringify({ v: 2, type: "attendance.changed" })), null)
  assert.equal(parseRealtimeRelayMessage("not-json"), null)
})

test("uses bounded exponential reconnect delays with jitter", () => {
  const { realtimeReconnectDelay } = loadModule()
  assert.equal(realtimeReconnectDelay(0, () => 0), 1000)
  assert.equal(realtimeReconnectDelay(3, () => 0), 8000)
  assert.equal(realtimeReconnectDelay(10, () => 1), 30000)
})

test("coalesces notifications during a refresh into one follow-up refresh", async () => {
  const { createRealtimeRefreshQueue } = loadModule()
  const releases = []
  let refreshes = 0
  const queue = createRealtimeRefreshQueue(() => new Promise((resolve) => {
    refreshes++
    releases.push(resolve)
  }))

  queue.notify()
  queue.notify()
  queue.notify()
  assert.equal(refreshes, 1)
  releases.shift()()
  await new Promise((resolve) => setTimeout(resolve, 0))
  assert.equal(refreshes, 2)
  releases.shift()()
  await queue.whenIdle()
  assert.equal(refreshes, 2)
})
