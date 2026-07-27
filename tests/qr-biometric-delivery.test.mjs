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

const { normalizeScanId, resolveScanId, matchesScanDelivery } = loadTypeScriptModule("./lib/qr-biometric-delivery.ts")

test("accepts MongoDB-compatible scan IDs and normalizes their case", () => {
  assert.equal(normalizeScanId(" 0123456789ABCDEFabcdef01 "), "0123456789abcdefabcdef01")
})

test("rejects missing or malformed scan IDs", () => {
  assert.equal(normalizeScanId(null), null)
  assert.equal(normalizeScanId("short"), null)
  assert.equal(normalizeScanId("0123456789abcdefabcdef0z"), null)
  assert.equal(normalizeScanId("0123456789abcdefabcdef012"), null)
})

test("distinguishes an omitted scan ID from every supplied malformed value", () => {
  assert.equal(JSON.stringify(resolveScanId(undefined, undefined)), '{"supplied":false,"value":null}')
  assert.equal(JSON.stringify(resolveScanId(null, null)), '{"supplied":false,"value":null}')
  assert.equal(JSON.stringify(resolveScanId(123, undefined)), '{"supplied":true,"value":null}')
  assert.equal(JSON.stringify(resolveScanId({}, undefined)), '{"supplied":true,"value":null}')
  assert.equal(JSON.stringify(resolveScanId("", undefined)), '{"supplied":true,"value":null}')
  assert.equal(JSON.stringify(resolveScanId(null, "0123456789ABCDEFabcdef01")), '{"supplied":true,"value":"0123456789abcdefabcdef01"}')
})

test("recognizes an exact replay and rejects a scan ID collision", () => {
  const stored = { deviceId: "QRB-001", decodedData: "https://dosw.iitr.ac.in/StudentProxy.aspx?id=abc" }
  assert.equal(matchesScanDelivery(stored, "QRB-001", stored.decodedData), true)
  assert.equal(matchesScanDelivery(stored, "QRB-002", stored.decodedData), false)
  assert.equal(matchesScanDelivery(stored, "QRB-001", `${stored.decodedData}2`), false)
})
