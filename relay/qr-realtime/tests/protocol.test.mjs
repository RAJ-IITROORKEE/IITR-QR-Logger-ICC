import assert from "node:assert/strict"
import test from "node:test"

import {
  durableAcknowledgement,
  validateAuthMessage,
  validateScanMessage,
  verifyAudienceToken,
} from "../src/protocol.mjs"

test("validates scanner auth and scan messages with strict bounds", () => {
  assert.equal(validateAuthMessage({
    v: 1,
    type: "auth",
    role: "scanner",
    deviceId: "QRB-201",
    apiKey: `qlicc_${"a".repeat(43)}`,
    macAddress: "98:88:E0:0E:DD:50",
  }).ok, true)
  assert.equal(validateScanMessage({ v: 1, type: "scan.submit", scanId: "a".repeat(24), decodedData: "https://dosw.iitr.ac.in/StudentProxy.aspx?id=1" }).ok, true)
  assert.equal(validateScanMessage({ v: 1, type: "scan.submit", scanId: "bad", decodedData: "x" }).ok, false)
  assert.equal(validateScanMessage({ v: 1, type: "scan.submit", scanId: "a".repeat(24), decodedData: "x".repeat(513) }).ok, false)
})

test("recognizes only an exact durable upstream acknowledgement", () => {
  const scanId = "a".repeat(24)
  const saved = { success: true, scanId, persistence: { status: "saved" } }
  assert.equal(durableAcknowledgement(200, saved, scanId), true)
  assert.equal(durableAcknowledgement(200, { ...saved, scanId: "b".repeat(24) }, scanId), false)
  assert.equal(durableAcknowledgement(200, { ...saved, persistence: { status: "queued" } }, scanId), false)
  assert.equal(durableAcknowledgement(503, saved, scanId), false)
})

test("verifies signed browser tokens by role, audience, expiry, and signature", async () => {
  const { createHmac } = await import("node:crypto")
  const secret = "s".repeat(64)
  const payload = Buffer.from(JSON.stringify({ v: 1, aud: "qr-realtime-relay", role: "dashboard", iat: 100, exp: 160, nonce: "n" })).toString("base64url")
  const signature = createHmac("sha256", secret).update(payload).digest("base64url")
  const token = `${payload}.${signature}`
  assert.equal(verifyAudienceToken(token, secret, "dashboard", 120)?.role, "dashboard")
  assert.equal(verifyAudienceToken(token, secret, "display", 120), null)
  assert.equal(verifyAudienceToken(token, secret, "dashboard", 161), null)
})
