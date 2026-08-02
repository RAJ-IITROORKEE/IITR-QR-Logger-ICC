import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import test from "node:test"
import ts from "typescript"
import vm from "node:vm"

const require = createRequire(import.meta.url)

function loadTypeScriptModule(filePath) {
  const source = readFileSync(filePath, "utf8")
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText
  const cjsModule = { exports: {} }
  const moduleRequire = (specifier) => specifier === "server-only" ? {} : require(specifier)
  vm.runInNewContext(compiled, { exports: cjsModule.exports, module: cjsModule, URL, require: moduleRequire }, { filename: filePath })
  return cjsModule.exports
}

const { buildStoredStudentPhotoPath } = loadTypeScriptModule("./lib/qr-biometric-photo-path.ts")
const { isAllowedStudentPhotoContentType, isStoredStudentPhotoUrl } = loadTypeScriptModule("./lib/qr-biometric-photo.ts")

test("builds a stable, non-identifying Blob pathname for the same QR", () => {
  const decodedData = "https://dosw.iitr.ac.in/StudentProxy.aspx?id=student-1"
  const first = buildStoredStudentPhotoPath(decodedData, "image/jpeg")
  const second = buildStoredStudentPhotoPath(decodedData, "image/jpeg")

  assert.equal(first, second)
  assert.match(first, /^student-photos\/[a-f0-9]{64}\.jpg$/)
  assert.notEqual(first.includes("student-1"), true)
})

test("recognizes only stored Blob URLs", () => {
  assert.equal(isStoredStudentPhotoUrl("https://store.public.blob.vercel-storage.com/student-photos/a.jpg"), false)
  assert.equal(isStoredStudentPhotoUrl("https://store.private.blob.vercel-storage.com/student-photos/a.jpg"), true)
  assert.equal(isStoredStudentPhotoUrl("https://dosw.iitr.ac.in/GetImageHandler.ashx?enrollment=1&type=photo"), false)
})

test("allows inert raster photo types and rejects active content", () => {
  assert.equal(isAllowedStudentPhotoContentType("image/jpeg; charset=binary"), true)
  assert.equal(isAllowedStudentPhotoContentType("image/png"), true)
  assert.equal(isAllowedStudentPhotoContentType("image/svg+xml"), false)
  assert.equal(isAllowedStudentPhotoContentType("text/html"), false)
})
