import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import ts from "typescript"
import vm from "node:vm"

function loadTypeScriptModule(filePath) {
  const source = readFileSync(filePath, "utf8")
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText
  const cjsModule = { exports: {} }
  vm.runInNewContext(compiled, { exports: cjsModule.exports, module: cjsModule }, { filename: filePath })
  return cjsModule.exports
}

const { normalizeMacAddress, resolveDeviceMacRegistration } = loadTypeScriptModule("./lib/device-mac-registration.ts")

test("normalizes common MAC address formats", () => {
  assert.equal(normalizeMacAddress("aabbccddeeff"), "AA:BB:CC:DD:EE:FF")
  assert.equal(normalizeMacAddress("aa-bb-cc-dd-ee-ff"), "AA:BB:CC:DD:EE:FF")
  assert.equal(normalizeMacAddress("aa:bb:cc:dd:ee:ff"), "AA:BB:CC:DD:EE:FF")
  assert.equal(normalizeMacAddress("not-a-mac"), null)
})

test("registers and locks the first valid MAC address", () => {
  const now = new Date("2026-06-10T00:00:00.000Z")
  const result = resolveDeviceMacRegistration({ macAddress: null, macAddressLockedAt: null }, "AA:BB:CC:DD:EE:FF", now)

  assert.equal(result.ok, true)
  assert.equal(result.status, "registered")
  assert.equal(result.updateData.macAddress, "AA:BB:CC:DD:EE:FF")
  assert.equal(result.updateData.macAddressLockedAt.toISOString(), now.toISOString())
  assert.equal(result.updateData.lastSeenAt.toISOString(), now.toISOString())
  assert.equal(result.updateData.apiKeyLastUsedAt.toISOString(), now.toISOString())
})

test("verifies the same locked MAC without changing the lock", () => {
  const lockedAt = new Date("2026-06-09T00:00:00.000Z")
  const now = new Date("2026-06-10T00:00:00.000Z")
  const result = resolveDeviceMacRegistration({ macAddress: "AA:BB:CC:DD:EE:FF", macAddressLockedAt: lockedAt }, "aa-bb-cc-dd-ee-ff", now)

  assert.equal(result.ok, true)
  assert.equal(result.status, "verified")
  assert.equal(result.updateData.macAddress, undefined)
  assert.equal(result.updateData.macAddressLockedAt, undefined)
  assert.equal(result.updateData.lastSeenAt.toISOString(), now.toISOString())
  assert.equal(result.updateData.apiKeyLastUsedAt.toISOString(), now.toISOString())
})

test("rejects a different MAC after the device is locked", () => {
  const result = resolveDeviceMacRegistration({ macAddress: "AA:BB:CC:DD:EE:FF", macAddressLockedAt: new Date() }, "11:22:33:44:55:66")

  assert.equal(result.ok, false)
  assert.equal(result.status, "conflict")
  assert.equal(result.lockedMacAddress, "AA:BB:CC:DD:EE:FF")
})
