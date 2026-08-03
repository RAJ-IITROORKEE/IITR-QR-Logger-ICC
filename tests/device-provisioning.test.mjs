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

const { deviceNumberMatchesKind, normalizeDeviceNumber } = loadTypeScriptModule("./lib/device-provisioning.ts")

test("accepts explicit QR device IDs and normalizes case", () => {
  assert.equal(normalizeDeviceNumber("qr-102"), "QR-102")
  assert.equal(normalizeDeviceNumber(" QRB-002 "), "QRB-002")
  assert.equal(normalizeDeviceNumber(" tab5-001 "), "TAB5-001")
})

test("rejects unsafe or empty device IDs", () => {
  assert.equal(normalizeDeviceNumber(""), null)
  assert.equal(normalizeDeviceNumber("QR 102"), null)
  assert.equal(normalizeDeviceNumber("QR-102/../../admin"), null)
  assert.equal(normalizeDeviceNumber("QR-"), null)
})

test("keeps scanner and Tab5 device prefixes consistent with their kind", () => {
  assert.equal(deviceNumberMatchesKind("TAB5-001", "TAB5_DISPLAY"), true)
  assert.equal(deviceNumberMatchesKind("QRB-002", "QR_SCANNER"), true)
  assert.equal(deviceNumberMatchesKind("QR-102", "QR_SCANNER"), true)
  assert.equal(deviceNumberMatchesKind("QRB-002", "TAB5_DISPLAY"), false)
  assert.equal(deviceNumberMatchesKind("TAB5-001", "QR_SCANNER"), false)
})
