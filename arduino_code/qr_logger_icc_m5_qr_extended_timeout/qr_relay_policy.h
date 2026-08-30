#pragma once

#include <stdint.h>

constexpr uint32_t QR_RELAY_ACK_TIMEOUT_MS = 25000;

enum class QrRelayDecision : uint8_t {
  RELAY_SEND,
  RELAY_WAIT,
  RELAY_RETRY,
  COMPLETE,
  HTTPS_FALLBACK,
};

enum class QrRelayResultDisposition : uint8_t {
  RETRY,
  BLOCKED,
  INVALID,
};

inline QrRelayResultDisposition qrRelayResultDisposition(
    int httpStatus,
    bool retryable,
    bool invalidQr,
    bool scanIdCollision) {
  if (invalidQr || httpStatus == 413 || httpStatus == 422 || (httpStatus == 409 && scanIdCollision)) {
    return QrRelayResultDisposition::INVALID;
  }
  if (httpStatus == 400 || httpStatus == 401 || httpStatus == 403 || httpStatus == 409) {
    return QrRelayResultDisposition::BLOCKED;
  }
  return QrRelayResultDisposition::RETRY;
}

inline QrRelayDecision qrRelayDecision(
    bool configured,
    bool ready,
    bool sent,
    bool acknowledged,
    uint32_t sentAt,
    uint32_t now,
    uint32_t acknowledgementTimeoutMs) {
  if (acknowledged) return QrRelayDecision::COMPLETE;
  if (!sent) return configured && ready ? QrRelayDecision::RELAY_SEND : QrRelayDecision::HTTPS_FALLBACK;
  if (now - sentAt >= acknowledgementTimeoutMs) return QrRelayDecision::RELAY_RETRY;
  return QrRelayDecision::RELAY_WAIT;
}
