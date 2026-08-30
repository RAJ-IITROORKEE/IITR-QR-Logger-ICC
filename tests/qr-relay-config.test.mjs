import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const FIRMWARE_PATH = "./arduino_code/qr_logger_icc_m5_qr_extended_timeout/qr_logger_icc_m5_qr_extended_timeout.ino"

test("uses the active Mumbai Cloud Run relay hostname", () => {
  const firmware = readFileSync(FIRMWARE_PATH, "utf8")
  assert.match(firmware, /#define QR_RELAY_HOST "qr-realtime-relay-rpei5anbuq-el\.a\.run\.app"/)
  assert.doesNotMatch(firmware, /us-east4|rpei5anbuq-uk/)
})
