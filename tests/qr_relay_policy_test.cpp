#include <cassert>
#include <cstdint>

#include "../arduino_code/qr_logger_icc_m5_qr_extended_timeout/qr_relay_policy.h"

int main() {
  assert(qrRelayDecision(false, false, false, false, 0, 0, 3000) == QrRelayDecision::HTTPS_FALLBACK);
  assert(qrRelayDecision(true, false, false, false, 0, 0, 3000) == QrRelayDecision::HTTPS_FALLBACK);
  assert(qrRelayDecision(true, true, false, false, 0, 0, 3000) == QrRelayDecision::RELAY_SEND);
  assert(qrRelayDecision(true, true, true, false, 1000, 3999, 3000) == QrRelayDecision::RELAY_WAIT);
  assert(qrRelayDecision(true, true, true, false, 1000, 4000, 3000) == QrRelayDecision::HTTPS_FALLBACK);
  assert(qrRelayDecision(true, true, true, true, 1000, 1001, 3000) == QrRelayDecision::COMPLETE);

  // Unsigned subtraction must remain correct through millis() wraparound.
  assert(qrRelayDecision(true, true, true, false, UINT32_MAX - 1000, 2000, 3000) == QrRelayDecision::HTTPS_FALLBACK);
}
