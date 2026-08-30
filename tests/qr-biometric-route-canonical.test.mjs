import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import ts from "typescript"
import vm from "node:vm"

const ROUTE_PATH = "./app/api/qr-biometric-icc/route.ts"
const SCAN_ID = "0123456789abcdefabcdef01"
const DECODED_DATA = "https://dosw.iitr.ac.in/StudentProxy.aspx?id=student-1"

function storedReading(overrides = {}) {
  return {
    id: SCAN_ID,
    deviceId: "QRB-001",
    decodedData: DECODED_DATA,
    scanStatus: "success",
    entryState: "IN",
    characterCount: DECODED_DATA.length,
    studentInfo: { fullName: "Ada Student", enrollmentNo: "24115114" },
    studentPhotoUrl: null,
    studentInfoStatus: "scraped",
    studentInfoError: null,
    createdAt: new Date("2026-08-05T11:55:00.000Z"),
    ...overrides,
  }
}

function loadScannerRoute({
  canonicalResults = [{ status: "APPLIED", effectiveState: "IN" }],
  reading = storedReading(),
  previousReading = null,
  createdReading = storedReading(),
  knownIdentity = null,
  macRegistrationResult = { ok: true, status: "verified", macAddress: "AA:BB:CC:DD:EE:FF", updateData: {} },
  existingMacDevice = null,
} = {}) {
  const source = readFileSync(ROUTE_PATH, "utf8")
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const results = [...canonicalResults]
  const deferred = []
  const calls = {
    canonical: 0,
    deviceUpdate: 0,
    identityLookup: 0,
    profileFetch: 0,
    readingCreate: 0,
    readingCreateData: null,
    runDeferred: async () => { for (const callback of deferred.splice(0)) await callback() },
  }
  const moduleRequire = (specifier) => {
    if (specifier === "next/server") {
      return {
        NextResponse: { json: (body, init) => Response.json(body, init) },
        after: (callback) => deferred.push(callback),
      }
    }
    if (specifier === "@/lib/access-auth") {
      return { ACCESS_SESSION_COOKIE: "access", ADMIN_ACCESS_ROLES: [], verifyAccessSession: async () => false }
    }
    if (specifier === "@/lib/admin-auth") {
      return { ADMIN_SESSION_COOKIE: "admin", verifyAdminSession: () => false }
    }
    if (specifier === "@/lib/attendance-ledger") {
      return {
        deleteCanonicalAttendanceReadings: async () => ({ deletedReadings: 0 }),
        reconcilePendingCanonicalReadings: async () => 0,
        recordCanonicalQrAttendance: async () => {
          calls.canonical++
          const result = results.length > 1 ? results.shift() : results[0]
          if (result instanceof Error) throw result
          return result
        },
        updateCanonicalStudentPhoto: async () => false,
      }
    }
    if (specifier === "@/lib/device-mac-registration") {
      return { resolveDeviceMacRegistration: () => macRegistrationResult }
    }
    if (specifier === "@/lib/device-api-key") return { verifyDeviceApiKey: () => true }
    if (specifier === "@/lib/qr-biometric-delivery") {
      return {
        resolveScanId: (scanId, eventId) => {
          const supplied = scanId != null || eventId != null
          const value = typeof (scanId ?? eventId) === "string" && /^[0-9a-f]{24}$/i.test(scanId ?? eventId)
            ? String(scanId ?? eventId).toLowerCase()
            : null
          return { supplied, value }
        },
        matchesScanDelivery: (record, deviceId, decodedData) => record.deviceId === deviceId && record.decodedData === decodedData,
      }
    }
    if (specifier === "@/lib/qr-biometric-deletion") return { matchesDeletionScope: () => false }
    if (specifier === "@/lib/qr-biometric-profile") return { enrichWithKnownStudentProfiles: (readings) => readings }
    if (specifier === "@/lib/qr-biometric-photo") return { isStoredStudentPhotoUrl: () => false }
    if (specifier === "@/lib/qr-biometric-photo-storage") return { fetchAndStoreStudentPhoto: async () => null }
    if (specifier === "@/lib/qr-biometric-reporting") {
      return {
        QR_REPORTING_TIME_ZONE: "UTC",
        isSameReportingDay: () => false,
        isSameReportingMonth: () => false,
        parseReportingDateBoundary: () => null,
        parseReportingMonthRange: () => null,
        reportingDateKey: () => "2026-08-05",
      }
    }
    if (specifier === "@/lib/qr-biometric-student") {
      return {
        addDoswStudentPhotoFallback: (info) => info,
        extractStudentInfo: () => ({}),
        isDoswStudentUrl: (value) => typeof value === "string" && value.startsWith("https://dosw.iitr.ac.in/StudentProxy.aspx?id="),
        normalizeDecodedUrl: (value) => value,
      }
    }
    if (specifier === "@/lib/prisma") {
      return { prisma: {
        device: {
          findFirst: async (query) => query?.where?.macAddress ? existingMacDevice : ({
            id: "device-db-id",
            deviceNumber: "QRB-001",
            apiKeyHash: "hash",
            macAddress: null,
            macAddressLockedAt: null,
            deviceKind: "QR_SCANNER",
            enabled: true,
            disabledAt: null,
          }),
          update: async () => { calls.deviceUpdate++; return {} },
        },
        qrBiometricDeletion: { findUnique: async () => null },
        studentIdentity: {
          findUnique: async () => {
            calls.identityLookup++
            return knownIdentity
          },
        },
        qrBiometricReading: {
          findUnique: async () => reading,
          findFirst: async (query) => {
            if (query?.where?.studentInfoStatus === "scraped") return previousReading
            if (query?.select?.entryState) return previousReading ? { entryState: previousReading.entryState, createdAt: previousReading.createdAt } : null
            return null
          },
          findMany: async () => [],
          create: async ({ data }) => {
            calls.readingCreate++
            calls.readingCreateData = data
            return createdReading
          },
          updateMany: async () => ({ count: 0 }),
        },
      } }
    }
    throw new Error(`Unexpected module: ${specifier}`)
  }
  const cjsModule = { exports: {} }
  vm.runInNewContext(compiled, {
    Buffer,
    Date,
    Response,
    URL,
    clearTimeout,
    console: { error() {} },
    crypto,
    exports: cjsModule.exports,
    fetch: async () => {
      calls.profileFetch++
      throw new Error("External DOSW fetch should not run for a known student")
    },
    module: cjsModule,
    require: moduleRequire,
    setTimeout,
  }, { filename: ROUTE_PATH })
  return { POST: cjsModule.exports.POST, calls }
}

function scanRequest(decodedData = DECODED_DATA, extra = {}) {
  return new Request("https://scanner.test/api/qr-biometric-icc", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ deviceId: "QRB-001", apiKey: "test-key", scanId: SCAN_ID, decodedData, ...extra }),
  })
}

test("does not acknowledge a scanId when canonical attendance did not emit a durable change", async () => {
  const { POST, calls } = loadScannerRoute({ canonicalResults: [{ status: "IDENTITY_CONFLICT", effectiveState: null }] })

  const response = await POST(scanRequest())

  assert.equal(response.status, 503)
  const body = await response.json()
  assert.equal(body.success, false)
  assert.equal(body.scanId, SCAN_ID)
  assert.match(body.error, /retry with the same scanId/)
  assert.equal(calls.canonical, 1)
  assert.equal(calls.readingCreate, 0)
})

test("a stored scanId replay succeeds only after canonicalization succeeds", async () => {
  const { POST, calls } = loadScannerRoute({ canonicalResults: [new Error("temporary ledger failure"), { status: "APPLIED", effectiveState: "IN" }] })

  const firstResponse = await POST(scanRequest())
  const retryResponse = await POST(scanRequest())

  assert.equal(firstResponse.status, 503)
  assert.equal((await firstResponse.json()).success, false)
  assert.equal(retryResponse.status, 200)
  const retryBody = await retryResponse.json()
  assert.equal(retryBody.success, true)
  assert.equal(retryBody.scanId, SCAN_ID)
  assert.equal(retryBody.replayed, true)
  assert.equal(calls.canonical, 2)
  assert.equal(calls.readingCreate, 0)
})

test("rejects a scanId collision without attempting canonical attendance", async () => {
  const { POST, calls } = loadScannerRoute()

  const response = await POST(scanRequest(`${DECODED_DATA}-different`))

  assert.equal(response.status, 409)
  assert.equal((await response.json()).success, false)
  assert.equal(calls.canonical, 0)
})

test("a durable acknowledgement reports the canonical effective attendance state", async () => {
  const { POST } = loadScannerRoute({ canonicalResults: [{ status: "APPLIED", effectiveState: "OUT" }] })

  const response = await POST(scanRequest())
  const body = await response.json()

  assert.equal(response.status, 200)
  assert.equal(body.entryState, "OUT")
  assert.equal(body.received.entryState, "OUT")
})

test("a fresh known-student scan bypasses the external DOSW profile request", async () => {
  const previousReading = storedReading({ id: "fedcba987654321001234567", entryState: "OUT" })
  const { POST, calls } = loadScannerRoute({ reading: null, previousReading })

  const response = await POST(scanRequest())

  assert.equal(response.status, 200)
  assert.equal((await response.json()).success, true)
  assert.equal(calls.profileFetch, 0)
  assert.equal(calls.readingCreate, 1)
  assert.equal(calls.readingCreateData.studentInfo.enrollmentNo, "24115114")
  assert.equal(calls.readingCreateData.studentInfoStatus, "scraped")
})

test("a canonical student identity supplies the profile before reading-history or DOSW lookup", async () => {
  const knownIdentity = {
    enrollmentNo: "24115114",
    fullName: "Ada Student",
    profile: { emailId: "ada@example.test", bhawan: "Kasturba Bhawan" },
    studentPhotoUrl: "https://blob.example.test/student.jpg",
  }
  const { POST, calls } = loadScannerRoute({ reading: null, knownIdentity })

  const response = await POST(scanRequest())

  assert.equal(response.status, 200)
  assert.equal((await response.json()).fullName, "Ada Student")
  assert.equal(calls.identityLookup, 1)
  assert.equal(calls.profileFetch, 0)
  assert.equal(calls.readingCreateData.studentInfo.enrollmentNo, "24115114")
  assert.equal(calls.readingCreateData.studentInfo.emailId, "ada@example.test")
  assert.equal(calls.deviceUpdate, 0)
  await calls.runDeferred()
  assert.equal(calls.deviceUpdate, 1)
})

test("database readings override stale live-buffer copies after canonical reprojection", () => {
  const source = readFileSync(ROUTE_PATH, "utf8")
  assert.match(source, /for \(const reading of \[\.\.\.dbReadings, \.\.\.liveReadings\]\)/)
})

test("records valid API-key activity after rejecting a conflicting MAC", async () => {
  const { POST, calls } = loadScannerRoute({
    macRegistrationResult: { ok: false, status: "conflict", error: "MAC conflict", macAddress: "11:22:33:44:55:66" },
  })

  const response = await POST(scanRequest(DECODED_DATA, { macAddress: "11:22:33:44:55:66" }))

  assert.equal(response.status, 409)
  assert.equal(calls.deviceUpdate, 0)
  await calls.runDeferred()
  assert.equal(calls.deviceUpdate, 1)
})

test("records valid API-key activity when a new MAC is already owned by another device", async () => {
  const { POST, calls } = loadScannerRoute({
    macRegistrationResult: { ok: true, status: "registered", macAddress: "11:22:33:44:55:66", updateData: {} },
    existingMacDevice: { deviceNumber: "QRB-999" },
  })

  const response = await POST(scanRequest(DECODED_DATA, { macAddress: "11:22:33:44:55:66" }))

  assert.equal(response.status, 409)
  assert.equal(calls.deviceUpdate, 0)
  await calls.runDeferred()
  assert.equal(calls.deviceUpdate, 1)
})
