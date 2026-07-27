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

const { normalizeDeviceNumber } = loadTypeScriptModule("./lib/device-provisioning.ts")

test("accepts explicit QR device IDs and normalizes case", () => {
  assert.equal(normalizeDeviceNumber("qr-102"), "QR-102")
  assert.equal(normalizeDeviceNumber(" QRB-002 "), "QRB-002")
})

test("rejects unsafe or empty device IDs", () => {
  assert.equal(normalizeDeviceNumber(""), null)
  assert.equal(normalizeDeviceNumber("QR 102"), null)
  assert.equal(normalizeDeviceNumber("QR-102/../../admin"), null)
  assert.equal(normalizeDeviceNumber("QR-"), null)
})
