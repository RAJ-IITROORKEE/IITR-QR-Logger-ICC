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

const {
  isSameReportingDay,
  isSameReportingMonth,
  parseReportingDateBoundary,
  parseReportingMonthRange,
  reportingDateKey,
} = loadTypeScriptModule("./lib/qr-biometric-reporting.ts")

test("uses Asia/Kolkata instead of UTC for daily and monthly reporting", () => {
  const now = new Date("2026-08-01T19:00:00.000Z") // 2 August, 00:30 IST
  const sameLocalDay = new Date("2026-08-01T18:45:00.000Z")
  const previousLocalDay = new Date("2026-08-01T18:29:59.999Z")

  assert.equal(isSameReportingDay(sameLocalDay, now), true)
  assert.equal(isSameReportingDay(previousLocalDay, now), false)
  assert.equal(isSameReportingMonth(sameLocalDay, now), true)
  assert.equal(reportingDateKey(now), "2026-08-02")
})

test("parses date inputs as inclusive Asia/Kolkata calendar days", () => {
  assert.equal(parseReportingDateBoundary("2026-08-02", "start")?.toISOString(), "2026-08-01T18:30:00.000Z")
  assert.equal(parseReportingDateBoundary("2026-08-02", "end")?.toISOString(), "2026-08-02T18:30:00.000Z")
  assert.equal(parseReportingDateBoundary("not-a-date", "start"), null)
})

test("parses month inputs using Asia/Kolkata month boundaries", () => {
  const range = parseReportingMonthRange("2026-08")
  assert.equal(range?.start.toISOString(), "2026-07-31T18:30:00.000Z")
  assert.equal(range?.end.toISOString(), "2026-08-31T18:30:00.000Z")
})
