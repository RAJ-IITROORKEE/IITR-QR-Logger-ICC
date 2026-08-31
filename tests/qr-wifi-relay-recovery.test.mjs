import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const FIRMWARE_PATH = "./arduino_code/qr_logger_icc_m5_qr_extended_timeout/qr_logger_icc_m5_qr_extended_timeout.ino"

test("abandons a relay wait when Wi-Fi drops so recovery rebuilds the socket", () => {
  const firmware = readFileSync(FIRMWARE_PATH, "utf8")
  const relayWait = firmware.slice(
    firmware.indexOf("bool uploadScanViaRelay"),
    firmware.indexOf("UploadResult uploadScan"),
  )

  assert.match(relayWait, /if \(WiFi\.status\(\) != WL_CONNECTED\) \{[\s\S]*relayWifiAvailable = false;[\s\S]*relaySocket\.disconnect\(\);[\s\S]*relayReady = false;[\s\S]*return true;/)
  assert.match(firmware, /processPendingQueueOnce\(bool& relayWifiAvailable\)/)
  assert.match(firmware, /processPendingQueueOnce\(relayWifiAvailable\);/)
})
