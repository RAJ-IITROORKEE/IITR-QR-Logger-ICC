import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const firmware = readFileSync(
  "./arduino_code/qr_logger_icc_m5_qr_extended_timeout/qr_logger_icc_m5_qr_extended_timeout.ino",
  "utf8",
)
const example = readFileSync(
  "./arduino_code/qr_logger_icc_m5_qr_extended_timeout/secrets_qrb001.h.example",
  "utf8",
)
const qrb202Example = readFileSync(
  "./arduino_code/qr_logger_icc_m5_qr_extended_timeout/secrets_qrb202.h.example",
  "utf8",
)
const gitignore = readFileSync("./.gitignore", "utf8")

test("selects isolated QRB-001 credentials only for the QRB001 build", () => {
  assert.match(firmware, /#if defined\(QRB001_BUILD\)\s+#include "secrets_qrb001\.h"/s)
  assert.match(example, /#define QR_DEVICE_ID "QRB-001"/)
  assert.match(gitignore, /arduino_code\/\*\*\/secrets_\*\.h/)
})

test("selects isolated QRB-202 credentials without sharing another scanner key", () => {
  assert.match(firmware, /#elif defined\(QRB202_BUILD\)\s+#include "secrets_qrb202\.h"/s)
  assert.match(firmware, /#error "Select only one scanner credential build"/)
  assert.match(qrb202Example, /#define QR_DEVICE_ID "QRB-202"/)
})
