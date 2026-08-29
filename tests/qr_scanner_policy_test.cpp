#include <assert.h>
#include "../arduino_code/qr_logger_icc_m5_qr_extended_timeout/qr_scanner_policy.h"

static void test_trigger_policy() {
  assert(qrMotionDetected(0.01f, 0.01f, 0.02f, 0.035f));
  assert(!qrMotionDetected(0.005f, 0.005f, 0.005f, 0.035f));
  assert(!qrTriggerDue(true, false, 2000, 0, 1600));
  assert(qrTriggerDue(false, true, 100, 100, 1600));
  assert(!qrTriggerDue(false, false, 1599, 0, 1600));
  assert(qrTriggerDue(false, false, 1600, 0, 1600));
}

int main() {
  test_trigger_policy();
  return 0;
}
