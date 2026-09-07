#ifndef QR_SCAN_SPOOL_POLICY_H
#define QR_SCAN_SPOOL_POLICY_H

#include <stddef.h>
#include <stdint.h>

constexpr uint32_t QR_SCAN_SPOOL_MAGIC = 0x51525350UL;
constexpr uint16_t QR_SCAN_SPOOL_VERSION = 1;

inline uint32_t qrScanSpoolChecksum(const uint8_t* bytes, size_t length) {
  uint32_t checksum = 2166136261UL;
  for (size_t index = 0; index < length; ++index) {
    checksum ^= bytes[index];
    checksum *= 16777619UL;
  }
  return checksum;
}

inline bool qrScanSpoolHasValidScanId(const char scanId[25]) {
  for (size_t index = 0; index < 24; ++index) {
    char value = scanId[index];
    if (!((value >= '0' && value <= '9') || (value >= 'a' && value <= 'f') || (value >= 'A' && value <= 'F'))) return false;
  }
  return scanId[24] == '\0';
}

inline bool qrScanSpoolScanIdMatches(const char stored[25], const char acknowledged[25]) {
  if (!qrScanSpoolHasValidScanId(stored) || !qrScanSpoolHasValidScanId(acknowledged)) return false;
  for (size_t index = 0; index < 24; ++index) {
    if (stored[index] != acknowledged[index]) return false;
  }
  return true;
}

inline bool qrScanSpoolHasPayload(const char* payload, size_t capacity) {
  if (capacity == 0 || payload[0] == '\0') return false;
  for (size_t index = 1; index < capacity; ++index) {
    if (payload[index] == '\0') return true;
  }
  return false;
}

#endif
