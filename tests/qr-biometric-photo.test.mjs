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
    compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText
  const cjsModule = { exports: {} }
  const moduleRequire = (specifier) => specifier === "server-only" ? {} : require(specifier)
  vm.runInNewContext(compiled, { Buffer, RangeError, ReadableStream, exports: cjsModule.exports, module: cjsModule, URL, require: moduleRequire }, { filename: filePath })
  return cjsModule.exports
}

const { buildStoredStudentPhotoPath } = loadTypeScriptModule("./lib/qr-biometric-photo-path.ts")
const { isAllowedStudentPhotoContentType, isStoredStudentPhotoUrl } = loadTypeScriptModule("./lib/qr-biometric-photo.ts")
const { normalizeDeviceProfilePhoto, readBoundedPhotoStream } = loadTypeScriptModule("./lib/device-profile-photo.ts")
const sharp = require("sharp")

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

test("normalizes oversized progressive photos to a baseline 220px JPEG", async () => {
  const source = await sharp({
    create: { width: 1600, height: 1200, channels: 3, background: "#2746a8" },
  }).jpeg({ progressive: true }).toBuffer()

  const normalized = await normalizeDeviceProfilePhoto(source)
  const metadata = await sharp(normalized).metadata()

  assert.equal(metadata.format, "jpeg")
  assert.equal(metadata.width, 220)
  assert.equal(metadata.height, 220)
  assert.equal(normalized.includes(Buffer.from([0xff, 0xc2])), false)
  assert.equal(normalized.includes(Buffer.from([0xff, 0xc0])), true)
})

test("normalizes transparent PNG input to an opaque device JPEG", async () => {
  const source = await sharp({
    create: { width: 80, height: 160, channels: 4, background: { r: 39, g: 70, b: 168, alpha: 0.5 } },
  }).png().toBuffer()

  const normalized = await normalizeDeviceProfilePhoto(source)
  const metadata = await sharp(normalized).metadata()

  assert.equal(metadata.format, "jpeg")
  assert.equal(metadata.width, 220)
  assert.equal(metadata.height, 220)
  assert.equal(metadata.channels, 3)
})

test("bounds chunked profile photo streams before allocating the full body", async () => {
  let cancelled = false
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(4))
      controller.enqueue(new Uint8Array(5))
    },
    cancel() {
      cancelled = true
    },
  })

  await assert.rejects(readBoundedPhotoStream(stream, 8), RangeError)
  assert.equal(cancelled, true)
})

test("returns complete data from a bounded chunked profile photo stream", async () => {
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(Uint8Array.from([1, 2]))
      controller.enqueue(Uint8Array.from([3]))
      controller.close()
    },
  })

  assert.deepEqual([...await readBoundedPhotoStream(stream, 3)], [1, 2, 3])
})
