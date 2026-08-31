#include <assert.h>
#include <stdint.h>

#include "../arduino_code/qr_logger_icc_m5_qr_extended_timeout/qr_wifi_policy.h"

static void test_reconnect_policy() {
  constexpr uint32_t reconnectTimeoutMs = 15000;

  assert(qrWifiReconnectAction(true, false, 100, 0, 0, reconnectTimeoutMs) == QrWifiReconnectAction::NONE);
  assert(qrWifiReconnectAction(false, true, 14999, 0, 0, reconnectTimeoutMs) == QrWifiReconnectAction::NONE);
  assert(qrWifiReconnectAction(false, true, 15000, 0, 0, reconnectTimeoutMs) == QrWifiReconnectAction::ABORT_STALLED_ATTEMPT);

  // WL_IDLE_STATUS can persist after a timed-out attempt. Once no attempt is
  // active and the deadline is due, the caller must start a new attempt.
  assert(qrWifiReconnectAction(false, false, 20000, 0, 20001, reconnectTimeoutMs) == QrWifiReconnectAction::NONE);
  assert(qrWifiReconnectAction(false, false, 20001, 0, 20001, reconnectTimeoutMs) == QrWifiReconnectAction::START_ATTEMPT);

  assert(qrWifiReconnectAction(false, false, 5, 0, 0xFFFFFFF0u, reconnectTimeoutMs) == QrWifiReconnectAction::START_ATTEMPT);
}

int main() {
  test_reconnect_policy();
  return 0;
}
