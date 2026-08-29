#ifndef QR_SCANNER_POLICY_H
#define QR_SCANNER_POLICY_H

#include <stdint.h>

inline bool qrMotionDetected(float deltaX, float deltaY, float deltaZ, float threshold) {
  return deltaX + deltaY + deltaZ > threshold;
}

inline bool qrTriggerDue(bool idle, bool forceTrigger, uint32_t now, uint32_t lastTriggerAt, uint32_t intervalMs) {
  return !idle && (forceTrigger || now - lastTriggerAt >= intervalMs);
}

#endif
