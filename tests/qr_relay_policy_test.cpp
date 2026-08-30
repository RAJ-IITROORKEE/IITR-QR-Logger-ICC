#include <cassert>
#include <cstdint>

#include "../arduino_code/qr_logger_icc_m5_qr_extended_timeout/qr_relay_policy.h"

int main() {
  assert(qrRelayDecision(false, false, false, false, 0, 0, QR_RELAY_ACK_TIMEOUT_MS) == QrRelayDecision::HTTPS_FALLBACK);
  assert(qrRelayDecision(true, false, false, false, 0, 0, QR_RELAY_ACK_TIMEOUT_MS) == QrRelayDecision::HTTPS_FALLBACK);
  assert(qrRelayDecision(true, true, false, false, 0, 0, QR_RELAY_ACK_TIMEOUT_MS) == QrRelayDecision::RELAY_SEND);
  assert(qrRelayDecision(true, true, true, false, 1000, 4000, QR_RELAY_ACK_TIMEOUT_MS) == QrRelayDecision::RELAY_WAIT);
  assert(qrRelayDecision(true, false, true, false, 1000, 4000, QR_RELAY_ACK_TIMEOUT_MS) == QrRelayDecision::RELAY_WAIT);
  assert(qrRelayDecision(true, true, true, false, 1000, 25999, QR_RELAY_ACK_TIMEOUT_MS) == QrRelayDecision::RELAY_WAIT);
  assert(qrRelayDecision(true, true, true, false, 1000, 26000, QR_RELAY_ACK_TIMEOUT_MS) == QrRelayDecision::RELAY_RETRY);
  assert(qrRelayDecision(true, true, true, true, 1000, 1001, QR_RELAY_ACK_TIMEOUT_MS) == QrRelayDecision::COMPLETE);

  assert(qrRelayResultDisposition(422, false, true, false) == QrRelayResultDisposition::INVALID);
  assert(qrRelayResultDisposition(409, false, false, true) == QrRelayResultDisposition::INVALID);
  assert(qrRelayResultDisposition(401, false, false, false) == QrRelayResultDisposition::BLOCKED);
  assert(qrRelayResultDisposition(503, true, false, false) == QrRelayResultDisposition::RETRY);
  assert(qrRelayResultDisposition(418, false, false, false) == QrRelayResultDisposition::RETRY);

  // Unsigned subtraction must remain correct through millis() wraparound.
  assert(qrRelayDecision(true, true, true, false, UINT32_MAX - 1000, 2000, QR_RELAY_ACK_TIMEOUT_MS) == QrRelayDecision::RELAY_WAIT);
}
