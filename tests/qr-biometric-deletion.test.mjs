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

const { matchesDeletionScope } = loadTypeScriptModule("./lib/qr-biometric-deletion.ts")

const reading = {
  id: "abc",
  deviceId: "QR-102",
  timestamp: "2026-07-27T10:00:00.000Z",
}

test("deletion scope matches a selected device and time range", () => {
  assert.equal(matchesDeletionScope(reading, { deviceId: "QR-102", from: new Date("2026-07-27T09:00:00.000Z"), to: new Date("2026-07-27T11:00:00.000Z") }), true)
  assert.equal(matchesDeletionScope(reading, { deviceId: "QR-103", from: null, to: null }), false)
})

test("deletion scope uses an exclusive upper bound", () => {
  assert.equal(matchesDeletionScope(reading, { deviceId: null, from: null, to: new Date("2026-07-27T10:00:00.000Z") }), false)
})
