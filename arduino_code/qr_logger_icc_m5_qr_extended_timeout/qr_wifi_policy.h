#pragma once

#include <stdint.h>

enum class QrWifiReconnectAction : uint8_t {
  NONE,
  START_ATTEMPT,
  ABORT_STALLED_ATTEMPT,
};

inline QrWifiReconnectAction qrWifiReconnectAction(
    bool connected,
    bool attemptInProgress,
    uint32_t now,
    uint32_t attemptStartedAt,
    uint32_t nextAttemptAt,
    uint32_t attemptTimeoutMs) {
  if (connected) return QrWifiReconnectAction::NONE;
  if (attemptInProgress) {
    return now - attemptStartedAt >= attemptTimeoutMs
        ? QrWifiReconnectAction::ABORT_STALLED_ATTEMPT
        : QrWifiReconnectAction::NONE;
  }

  return nextAttemptAt == 0 || static_cast<int32_t>(now - nextAttemptAt) >= 0
      ? QrWifiReconnectAction::START_ATTEMPT
      : QrWifiReconnectAction::NONE;
}
