#pragma once

#include <stdint.h>

enum class QrRelayDecision : uint8_t {
  RELAY_SEND,
  RELAY_WAIT,
  COMPLETE,
  HTTPS_FALLBACK,
};

inline QrRelayDecision qrRelayDecision(
    bool configured,
    bool ready,
    bool sent,
    bool acknowledged,
    uint32_t sentAt,
    uint32_t now,
    uint32_t acknowledgementTimeoutMs) {
  if (acknowledged) return QrRelayDecision::COMPLETE;
  if (!configured || !ready) return QrRelayDecision::HTTPS_FALLBACK;
  if (!sent) return QrRelayDecision::RELAY_SEND;
  if (now - sentAt >= acknowledgementTimeoutMs) return QrRelayDecision::HTTPS_FALLBACK;
  return QrRelayDecision::RELAY_WAIT;
}
