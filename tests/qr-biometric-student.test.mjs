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
  vm.runInNewContext(compiled, { exports: cjsModule.exports, module: cjsModule, URL }, { filename: filePath })
  return cjsModule.exports
}

const { extractStudentInfo } = loadTypeScriptModule("./lib/qr-biometric-student.ts")
const { applyKnownStudentProfile, enrichWithKnownStudentProfiles } = loadTypeScriptModule("./lib/qr-biometric-profile.ts")

test("extracts DOSW profile fields from table text and input values", () => {
  const html = `
    <table>
      <tr><td>Enrollment No</td><td><input value="22110001" readonly></td></tr>
      <tr><td>Full Name</td><td>Test Student</td></tr>
      <tr><td>Email ID</td><td><input value="student@iitr.ac.in"></td></tr>
    </table>
  `
  const info = extractStudentInfo(html, "https://dosw.iitr.ac.in/StudentProxy.aspx?id=test")

  assert.equal(info.enrollmentNo, "22110001")
  assert.equal(info.fullName, "Test Student")
  assert.equal(info.emailId, "student@iitr.ac.in")
})

test("reuses known student data while preserving the current scrape failure", () => {
  const failedReading = {
    id: "new",
    decodedData: "https://dosw.iitr.ac.in/StudentProxy.aspx?id=test",
    studentInfo: null,
    studentInfoStatus: "failed",
    studentInfoError: "Student profile timed out",
  }
  const knownReading = {
    id: "old",
    decodedData: failedReading.decodedData,
    studentInfo: { fullName: "Test Student", enrollmentNo: "22110001" },
    studentInfoStatus: "scraped",
    studentInfoError: null,
  }

  const enriched = applyKnownStudentProfile(failedReading, knownReading)
  assert.equal(enriched.studentInfo.fullName, "Test Student")
  assert.equal(enriched.studentInfo.enrollmentNo, "22110001")
  assert.equal(enriched.studentInfoStatus, "failed")
  assert.equal(enriched.studentInfoError, "Student profile timed out")
})

test("combines the richest known profile with a stored photo from another reading", () => {
  const decodedData = "https://dosw.iitr.ac.in/StudentProxy.aspx?id=test"
  const readings = [
    { decodedData, studentInfo: null, studentPhotoUrl: null },
    { decodedData, studentInfo: { fullName: "Test Student", enrollmentNo: "22110001", emailId: "student@iitr.ac.in" }, studentPhotoUrl: null },
    { decodedData, studentInfo: { enrollmentNo: "22110001" }, studentPhotoUrl: "https://store.private.blob.vercel-storage.com/student-photos/a.jpg" },
  ]

  const [enriched] = enrichWithKnownStudentProfiles(readings)
  assert.equal(enriched.studentInfo.fullName, "Test Student")
  assert.equal(enriched.studentInfo.emailId, "student@iitr.ac.in")
  assert.equal(enriched.studentPhotoUrl, "https://store.private.blob.vercel-storage.com/student-photos/a.jpg")
})
