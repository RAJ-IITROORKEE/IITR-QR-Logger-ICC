#include <M5Unified.h>
#include "M5UnitQRCode.h"
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <WebSocketsClient.h>
#include <esp_system.h>
#include <freertos/FreeRTOS.h>
#include <freertos/queue.h>
#include <freertos/task.h>
#include <math.h>
#include <time.h>
#include "secrets.h"
#include "qr_scanner_policy.h"
#include "qr_relay_policy.h"

M5UnitQRCodeUART qrcode;

// -------- API CONFIG --------
const char* API_URL = "https://iitrlogger.com/api/qr-biometric-icc";
const char* DASHBOARD_URL = "https://iitrlogger.com";
#ifndef QR_DEVICE_ID
#define QR_DEVICE_ID "QRB-001"
#endif
const char* DEVICE_ID = QR_DEVICE_ID;
#ifndef QR_RELAY_HOST
#define QR_RELAY_HOST "qr-realtime-relay-rpei5anbuq-uk.a.run.app"
#endif
#ifndef QR_RELAY_PATH
#define QR_RELAY_PATH "/v1/realtime"
#endif
const char* RELAY_HOST = QR_RELAY_HOST;
const char* RELAY_PATH = QR_RELAY_PATH;

static const char ISRG_ROOT_X1[] PROGMEM = R"EOF(
-----BEGIN CERTIFICATE-----
MIIFazCCA1OgAwIBAgIRAIIQz7DSQONZRGPgu2OCiwAwDQYJKoZIhvcNAQELBQAw
TzELMAkGA1UEBhMCVVMxKTAnBgNVBAoTIEludGVybmV0IFNlY3VyaXR5IFJlc2Vh
cmNoIEdyb3VwMRUwEwYDVQQDEwxJU1JHIFJvb3QgWDEwHhcNMTUwNjA0MTEwNDM4
WhcNMzUwNjA0MTEwNDM4WjBPMQswCQYDVQQGEwJVUzEpMCcGA1UEChMgSW50ZXJu
ZXQgU2VjdXJpdHkgUmVzZWFyY2ggR3JvdXAxFTATBgNVBAMTDElTUkcgUm9vdCBY
MTCCAiIwDQYJKoZIhvcNAQEBBQADggIPADCCAgoCggIBAK3oJHP0FDfzm54rVygc
h77ct984kIxuPOZXoHj3dcKi/vVqbvYATyjb3miGbESTtrFj/RQSa78f0uoxmyF+
0TM8ukj13Xnfs7j/EvEhmkvBioZxaUpmZmyPfjxwv60pIgbz5MDmgK7iS4+3mX6U
A5/TR5d8mUgjU+g4rk8Kb4Mu0UlXjIB0ttov0DiNewNwIRt18jA8+o+u3dpjq+sW
T8KOEUt+zwvo/7V3LvSye0rgTBIlDHCNAymg4VMk7BPZ7hm/ELNKjD+Jo2FR3qyH
B5T0Y3HsLuJvW5iB4YlcNHlsdu87kGJ55tukmi8mxdAQ4Q7e2RCOFvu396j3x+UC
B5iPNgiV5+I3lg02dZ77DnKxHZu8A/lJBdiB3QW0KtZB6awBdpUKD9jf1b0SHzUv
KBds0pjBqAlkd25HN7rOrFleaJ1/ctaJxQZBKT5ZPt0m9STJEadao0xAH0ahmbWn
OlFuhjuefXKnEgV4We0+UXgVCwOPjdAvBbI+e0ocS3MFEvzG6uBQE3xDk3SzynTn
jh8BCNAw1FtxNrQHusEwMFxIt4I7mKZ9YIqioymCzLq9gwQbooMDQaHWBfEbwrbw
qHyGO0aoSCqI3Haadr8faqU9GY/rOPNk3sgrDQoo//fb4hVC1CLQJ13hef4Y53CI
rU7m2Ys6xt0nUW7/vGT1M0NPAgMBAAGjQjBAMA4GA1UdDwEB/wQEAwIBBjAPBgNV
HRMBAf8EBTADAQH/MB0GA1UdDgQWBBR5tFnme7bl5AFzgAiIyBpY9umbbjANBgkq
hkiG9w0BAQsFAAOCAgEAVR9YqbyyqFDQDLHYGmkgJykIrGF1XIpu+ILlaS/V9lZL
ubhzEFnTIZd+50xx+7LSYK05qAvqFyFWhfFQDlnrzuBZ6brJFe+GnY+EgPbk6ZGQ
3BebYhtF8GaV0nxvwuo77x/Py9auJ/GpsMiu/X1+mvoiBOv/2X/qkSsisRcOj/KK
NFtY2PwByVS5uCbMiogziUwthDyC3+6WVwW6LLv3xLfHTjuCvjHIInNzktHCgKQ5
ORAzI4JMPJ+GslWYHb4phowim57iaztXOoJwTdwJx4nLCgdNbOhdjsnvzqvHu7Ur
TkXWStAmzOVyyghqpZXjFaH3pO3JLF+l+/+sKAIuvtd7u+Nxe5AW0wdeRlN8NwdC
jNPElpzVmbUq4JUagEiuTDkHzsxHpFKVK7q4+63SM1N95R1NbdWhscdCb+ZAJzVc
oyi3B43njTOQ5yOf+1CceWxG1bQVs5ZufpsMljq4Ui0/1lvh+wjChP4kqKOJ2qxq
4RgqsahDYVvTH9w7jXbyLeiNdd8XM2w9U/t7y0Ff/9yi0GE44Za4rF2LN9d11TPA
mRGunUHBcnWEvgJBQl9nJEiU0Zsnvgc/ubhPgXRR4Xq37Z0j4r7g1SgEEzwxA57d
emyPxgcYxn/eR44/KJ4EBs+lVDR3veyJm+kXQ99b21/+jh5Xos1AnX5iItreGCc=
-----END CERTIFICATE-----
)EOF";

static const char GTS_ROOT_R1[] PROGMEM = R"EOF(
-----BEGIN CERTIFICATE-----
MIIFVzCCAz+gAwIBAgINAgPlk28xsBNJiGuiFzANBgkqhkiG9w0BAQwFADBHMQsw
CQYDVQQGEwJVUzEiMCAGA1UEChMZR29vZ2xlIFRydXN0IFNlcnZpY2VzIExMQzEU
MBIGA1UEAxMLR1RTIFJvb3QgUjEwHhcNMTYwNjIyMDAwMDAwWhcNMzYwNjIyMDAw
MDAwWjBHMQswCQYDVQQGEwJVUzEiMCAGA1UEChMZR29vZ2xlIFRydXN0IFNlcnZp
Y2VzIExMQzEUMBIGA1UEAxMLR1RTIFJvb3QgUjEwggIiMA0GCSqGSIb3DQEBAQUA
A4ICDwAwggIKAoICAQC2EQKLHuOhd5s73L+UPreVp0A8of2C+X0yBoJx9vaMf/vo
27xqLpeXo4xL+Sv2sfnOhB2x+cWX3u+58qPpvBKJXqeqUqv4IyfLpLGcY9vXmX7w
Cl7raKb0xlpHDU0QM+NOsROjyBhsS+z8CZDfnWQpJSMHobTSPS5g4M/SCYe7zUjw
TcLCeoiKu7rPWRnWr4+wB7CeMfGCwcDfLqZtbBkOtdh+JhpFAz2weaSUKK0Pfybl
qAj+lug8aJRT7oM6iCsVlgmy4HqMLnXWnOunVmSPlk9orj2XwoSPwLxAwAtcvfaH
szVsrBhQf4TgTM2S0yDpM7xSma8ytSmzJSq0SPly4cpk9+aCEI3oncKKiPo4Zor8
Y/kB+Xj9e1x3+naH+uzfsQ55lVe0vSbv1gHR6xYKu44LtcXFilWr06zqkUspzBmk
MiVOKvFlRNACzqrOSbTqn3yDsEB750Orp2yjj32JgfpMpf/VjsPOS+C12LOORc92
wO1AK/1TD7Cn1TsNsYqiA94xrcx36m97PtbfkSIS5r762DL8EGMUUXLeXdYWk70p
aDPvOmbsB4om3xPXV2V4J95eSRQAogB/mqghtqmxlbCluQ0WEdrHbEg8QOB+DVrN
VjzRlwW5y0vtOUucxD/SVRNuJLDWcfr0wbrM7Rv1/oFB2ACYPTrIrnqYNxgFlQID
AQABo0IwQDAOBgNVHQ8BAf8EBAMCAYYwDwYDVR0TAQH/BAUwAwEB/zAdBgNVHQ4E
FgQU5K8rJnEaK0gnhS9SZizv8IkTcT4wDQYJKoZIhvcNAQEMBQADggIBAJ+qQibb
C5u+/x6Wki4+omVKapi6Ist9wTrYggoGxval3sBOh2Z5ofmmWJyq+bXmYOfg6LEe
QkEzCzc9zolwFcq1JKjPa7XSQCGYzyI0zzvFIoTgxQ6KfF2I5DUkzps+GlQebtuy
h6f88/qBVRRiClmpIgUxPoLW7ttXNLwzldMXG+gnoot7TiYaelpkttGsN/H9oPM4
7HLwEXWdyzRSjeZ2axfG34arJ45JK3VmgRAhpuo+9K4l/3wV3s6MJT/KYnAK9y8J
ZgfIPxz88NtFMN9iiMG1D53Dn0reWVlHxYciNuaCp+0KueIHoI17eko8cdLiA6Ef
MgfdG+RCzgwARWGAtQsgWSl4vflVy2PFPEz0tv/bal8xa5meLMFrUKTX5hgUvYU/
Z6tGn6D/Qqc6f1zLXbBwHSs09dR2CQzreExZBfMzQsNhFRAbd03OIozUhfJFfbdT
6u9AWpQKXCBfTkBdYiJ23//OYb2MI3jSNwLgjt7RETeJ9r/tSQdirpLsQBqvFAnZ
0E6yove+7u7Y/9waLd64NnHi/Hm3lCXRSHNboTXns5lndcEZOitHTtNCjv0xyBZm
2tIMPNuzjsmhDYAPexZ3FL//2wmUspO8IFgV6dtxQ/PeEMMA3KgqlbbC1j+Qa3bb
bP6MvPJwNQzcmRk13NfIRmPVNnGuV/u3gm3c
-----END CERTIFICATE-----
)EOF";

// -------- QR UART CONFIG --------
#define QR_UART_RX_PIN 5
#define QR_UART_TX_PIN 6

String lastDecoded = "";
String lastStudentName = "";
String lastEnrollment = "";
String lastEntryState = "";
String lastScanId = "";
String displayStatus = "BOOT";
String uploadStatus = "WAIT";
bool qrIdleMode = false;
bool imuReady = false;
float lastAx = 0;
float lastAy = 0;
float lastAz = 0;
unsigned long lastDecodedAt = 0;
unsigned long lastScanTriggerAt = 0;
unsigned long stableSince = 0;
unsigned long lastMotionCheckAt = 0;
const unsigned long DUPLICATE_SUPPRESS_MS = 3000;
const unsigned long SCAN_TRIGGER_INTERVAL_MS = 1600;
const unsigned long QR_IDLE_AFTER_STABLE_MS = 10000;
const unsigned long MOTION_CHECK_INTERVAL_MS = 200;
const float MOTION_WAKE_DELTA = 0.035f;
const size_t MAX_DECODED_DATA_LENGTH = 512;
const UBaseType_t SCAN_QUEUE_DEPTH = 8;
const size_t MAX_SERVER_RESPONSE_BYTES = 32 * 1024;
const unsigned long INITIAL_RETRY_MS = 2000;
const unsigned long MAX_RETRY_MS = 60000;
const unsigned long WIFI_RECONNECT_INTERVAL_MS = 5000;
const unsigned long WIFI_RECONNECT_TIMEOUT_MS = 15000;
const unsigned long WIFI_BADGE_REFRESH_MS = 1000;
const unsigned long NTP_SYNC_TIMEOUT_MS = 10000;
const unsigned long RELAY_ACK_TIMEOUT_MS = 3000;
const unsigned long QR_FRAME_COLLECTION_MS = 450;
const unsigned long QR_FRAME_POLL_MS = 5;
const unsigned long QR_FRAME_QUIET_MS = 80;

volatile size_t sessionFailedCount = 0;
unsigned long nextUploadAttemptAt = 0;
unsigned long uploadRetryMs = INITIAL_RETRY_MS;
unsigned long nextNtpAttemptAt = 0;
unsigned long nextWifiReconnectAt = 0;
unsigned long wifiReconnectStartedAt = 0;
unsigned long lastWifiBadgeAt = 0;
int lastWifiBadgeState = -1;
bool wifiPreviouslyConnected = false;
bool wifiReconnectInProgress = false;
volatile bool wifiRecovered = false;
QueueHandle_t scanQueue = nullptr;
QueueHandle_t uploadUiQueue = nullptr;
TaskHandle_t uploadTaskHandle = nullptr;
WebSocketsClient relaySocket;
bool relayConfigured = false;
bool relayConnected = false;
bool relayReady = false;
bool relayAttemptFinished = false;
bool relayAttemptAcknowledged = false;
char relayAwaitingScanId[25] = {};

void notifyUploadWorker();

struct ScanJob {
  char scanId[25];
  char decodedData[MAX_DECODED_DATA_LENGTH + 1];
};

StaticQueue_t scanQueueControl;
alignas(4) uint8_t scanQueueStorage[SCAN_QUEUE_DEPTH * sizeof(ScanJob)];

struct ServerReply {
  bool success = false;
  String scanId;
  String deviceId;
  String receivedDecodedData;
  String fullName;
  String enrollmentNo;
  String entryState;
  String persistenceStatus;
  String error;
  bool invalidQr = false;
};

enum UploadOutcome {
  UPLOAD_ACKNOWLEDGED,
  UPLOAD_RETRY,
  UPLOAD_BLOCKED,
  UPLOAD_INVALID
};

struct UploadResult {
  UploadOutcome outcome;
  int httpCode;
  ServerReply reply;
};

UploadResult relayAcknowledgedResult;

enum UploadUiEventType : uint8_t {
  UPLOAD_UI_ACKNOWLEDGED,
  UPLOAD_UI_INVALID,
  UPLOAD_UI_BLOCKED,
  UPLOAD_UI_RETRY,
  UPLOAD_UI_QUEUE_ERROR
};

struct UploadUiEvent {
  UploadUiEventType type;
  int httpCode;
  char scanId[25];
  char fullName[97];
  char enrollmentNo[49];
  char entryState[4];
};

class BoundedResponseStream : public Stream {
 public:
  explicit BoundedResponseStream(size_t limit) : limit_(limit) {}

  size_t write(uint8_t value) override {
    return write(&value, 1);
  }

  size_t write(const uint8_t* buffer, size_t size) override {
    if (overflowed_ || data_.length() + size > limit_) {
      overflowed_ = true;
      return 0;
    }
    return data_.concat(reinterpret_cast<const char*>(buffer), size) ? size : 0;
  }

  int available() override { return 0; }
  int read() override { return -1; }
  int peek() override { return -1; }
  void flush() override {}

  bool overflowed() const { return overflowed_; }
  const String& data() const { return data_; }

 private:
  String data_;
  size_t limit_;
  bool overflowed_ = false;
};

const uint16_t COLOR_BG = TFT_BLACK;
const uint16_t COLOR_TEXT = TFT_WHITE;
const uint16_t COLOR_DIM = 0x8410;
const uint16_t COLOR_OK = TFT_GREEN;
const uint16_t COLOR_WARN = TFT_ORANGE;
const uint16_t COLOR_BAD = TFT_RED;
const uint16_t COLOR_ACCENT = TFT_CYAN;

void toneStep(uint16_t freq, uint16_t durationMs) {
  if (M5.Speaker.isEnabled()) {
    M5.Speaker.tone(freq, durationMs);
  }
  delay(durationMs + 35);
}

void startupTone() {
  toneStep(900, 70);
  toneStep(1350, 80);
  toneStep(1800, 100);
}

void readyTone() {
  toneStep(1500, 80);
  toneStep(2100, 90);
}

void successTone() {
  toneStep(1200, 60);
  toneStep(1700, 70);
  toneStep(2300, 120);
}

void failTone() {
  toneStep(420, 140);
  toneStep(260, 180);
}

void invalidTone() {
  toneStep(520, 90);
  toneStep(260, 120);
  toneStep(180, 180);
}

String shortText(const String& value, int maxLen) {
  if (value.length() <= maxLen) return value;
  return value.substring(0, maxLen - 2) + "..";
}

void drawWifiBadge(bool wifiOk) {
  M5.Display.fillRoundRect(88, 2, 38, 15, 4, COLOR_BG);
  M5.Display.drawRoundRect(88, 2, 38, 15, 4, wifiOk ? COLOR_OK : COLOR_BAD);
  M5.Display.setTextSize(1);
  M5.Display.setTextColor(wifiOk ? COLOR_OK : COLOR_BAD, COLOR_BG);
  M5.Display.setCursor(93, 6);
  M5.Display.print(wifiOk ? "W:OK" : "W:--");
}

void refreshWifiBadge() {
  int currentState = static_cast<int>(WiFi.status());
  unsigned long now = millis();
  if (currentState == lastWifiBadgeState && now - lastWifiBadgeAt < WIFI_BADGE_REFRESH_MS) return;
  lastWifiBadgeState = currentState;
  lastWifiBadgeAt = now;
  drawWifiBadge(currentState == WL_CONNECTED);
}

void drawWrappedText(const String& value, int y, int maxLines) {
  String shown = value.length() ? value : "No QR data yet";
  M5.Display.setTextSize(1);
  M5.Display.setTextColor(COLOR_TEXT, COLOR_BG);

  int start = 0;
  for (int line = 0; line < maxLines; line++) {
    M5.Display.setCursor(8, y + line * 12);
    if (start >= shown.length()) {
      M5.Display.print(" ");
      continue;
    }
    M5.Display.print(shown.substring(start, min(start + 18, (int)shown.length())));
    start += 18;
  }
}

void drawStudentOrQr() {
  if (lastStudentName.length() == 0 && lastEnrollment.length() == 0) {
    M5.Display.setTextSize(1);
    M5.Display.setTextColor(COLOR_DIM, COLOR_BG);
    M5.Display.setCursor(8, 52);
    M5.Display.print("STUDENT:");
    drawWrappedText("PROFILE PENDING", 64, 2);
    M5.Display.setTextColor(COLOR_ACCENT, COLOR_BG);
    M5.Display.setCursor(8, 90);
    M5.Display.print("ENR --");
    return;
  }

  M5.Display.setTextSize(1);
  M5.Display.setTextColor(COLOR_DIM, COLOR_BG);
  M5.Display.setCursor(8, 52);
  M5.Display.print("STUDENT:");
  drawWrappedText(lastStudentName.length() ? lastStudentName : "Name not found", 64, 2);
  M5.Display.setTextColor(COLOR_ACCENT, COLOR_BG);
  M5.Display.setCursor(8, 90);
  M5.Display.print(shortText("ENR " + (lastEnrollment.length() ? lastEnrollment : "--"), 18));
}

void drawScreen() {
  bool wifiOk = WiFi.status() == WL_CONNECTED;

  M5.Display.fillScreen(COLOR_BG);
  M5.Display.setTextSize(1);
  M5.Display.setTextColor(COLOR_ACCENT, COLOR_BG);
  M5.Display.setCursor(5, 6);
  M5.Display.print(qrIdleMode ? "QR OFF" : "QR ICC");
  drawWifiBadge(wifiOk);

  M5.Display.drawFastHLine(0, 22, M5.Display.width(), COLOR_DIM);

  M5.Display.setTextSize(2);
  uint16_t statusColor = (displayStatus == "OUT" || displayStatus == "INVALID") ? COLOR_BAD : (displayStatus == "MARKED" || displayStatus == "IN" ? COLOR_OK : COLOR_WARN);
  M5.Display.setTextColor(statusColor, COLOR_BG);
  M5.Display.setCursor(8, 30);
  M5.Display.print(displayStatus);

  drawStudentOrQr();

  M5.Display.drawFastHLine(0, 114, M5.Display.width(), COLOR_DIM);
  M5.Display.setTextColor(uploadStatus == "UPLOADED" ? COLOR_OK : COLOR_DIM, COLOR_BG);
  M5.Display.setCursor(6, 118);
  M5.Display.print(shortText(uploadStatus, 12));
  M5.Display.setTextColor(COLOR_DIM, COLOR_BG);
  M5.Display.setCursor(68, 118);
  M5.Display.print("Q:");
  M5.Display.print(scanQueue == nullptr ? 0 : uxQueueMessagesWaiting(scanQueue));
  M5.Display.print(" F:");
  M5.Display.print(sessionFailedCount);
}

void printLine(const String& msg) {
  Serial.println(msg);
}

void printQueueCounts(const char* reason) {
  size_t pending = scanQueue == nullptr ? 0 : uxQueueMessagesWaiting(scanQueue);
  Serial.printf("RAM queue %s: pending=%u failed=%u\n", reason, static_cast<unsigned int>(pending), static_cast<unsigned int>(sessionFailedCount));
}

String lowerCopy(String value) {
  value.toLowerCase();
  return value;
}

bool hasQueryParamValue(const String& query, const String& key) {
  int start = 0;
  while (start <= query.length()) {
    int amp = query.indexOf('&', start);
    String part = amp >= 0 ? query.substring(start, amp) : query.substring(start);
    int eq = part.indexOf('=');
    String name = eq >= 0 ? part.substring(0, eq) : part;
    if (name == key && eq >= 0 && eq < part.length() - 1) return true;
    if (amp < 0) break;
    start = amp + 1;
  }
  return false;
}

bool isValidDoswStudentQr(String decodedData) {
  decodedData.trim();
  if (decodedData.length() > MAX_DECODED_DATA_LENGTH) return false;
  if (!decodedData.startsWith("https://")) return false;

  int pathStart = decodedData.indexOf('/', 8);
  if (pathStart < 0) return false;

  String host = lowerCopy(decodedData.substring(8, pathStart));
  if (host != "dosw.iitr.ac.in") return false;

  int queryStart = decodedData.indexOf('?', pathStart);
  if (queryStart < 0) return false;

  String path = lowerCopy(decodedData.substring(pathStart, queryStart));
  if (path.endsWith("/")) path.remove(path.length() - 1);
  if (path != "/studentproxy.aspx") return false;

  return hasQueryParamValue(decodedData.substring(queryStart + 1), "id");
}

String readQrFrame() {
  if (!qrcode.available()) return "";

  String candidate = qrcode.getDecodeData();
  if (candidate.length() == 0) return "";
  candidate.reserve(MAX_DECODED_DATA_LENGTH + 2);

  unsigned long startedAt = millis();
  unsigned long lastFragmentAt = startedAt;
  while (millis() - startedAt < QR_FRAME_COLLECTION_MS) {
    delay(QR_FRAME_POLL_MS);
    if (!qrcode.available()) {
      if (millis() - lastFragmentAt >= QR_FRAME_QUIET_MS) break;
      continue;
    }

    String fragment = qrcode.getDecodeData();
    if (fragment.length() == 0) continue;
    lastFragmentAt = millis();
    size_t maximumCollected = MAX_DECODED_DATA_LENGTH + 1;
    if (candidate.length() + fragment.length() > maximumCollected) {
      size_t remaining = maximumCollected - candidate.length();
      if (remaining > 0) candidate += fragment.substring(0, remaining);
      break;
    }
    candidate += fragment;
  }

  candidate.trim();
  return candidate;
}

void generateScanId(char target[25]) {
  uint8_t bytes[12];
  esp_fill_random(bytes, sizeof(bytes));
  const char* hex = "0123456789abcdef";
  for (size_t i = 0; i < sizeof(bytes); i++) {
    target[i * 2] = hex[bytes[i] >> 4];
    target[i * 2 + 1] = hex[bytes[i] & 0x0f];
  }
  target[24] = '\0';
}

size_t pendingScanCount() {
  return scanQueue == nullptr ? 0 : uxQueueMessagesWaiting(scanQueue);
}

bool enqueueScan(const String& decodedData, ScanJob& job) {
  if (scanQueue == nullptr || decodedData.length() == 0 || decodedData.length() > MAX_DECODED_DATA_LENGTH) return false;
  memset(&job, 0, sizeof(job));
  generateScanId(job.scanId);
  memcpy(job.decodedData, decodedData.c_str(), decodedData.length() + 1);
  return xQueueSend(scanQueue, &job, 0) == pdTRUE;
}

void showInvalidQr() {
  lastStudentName = "";
  lastEnrollment = "";
  lastEntryState = "";
  displayStatus = "INVALID";
  uploadStatus = "INVALID QR";
  drawScreen();
  invalidTone();
}

void initMotionSensor() {
  imuReady = M5.Imu.isEnabled();
  stableSince = millis();
  if (!imuReady) {
    printLine("IMU not found; QR idle mode disabled");
    return;
  }

  M5.Imu.update();
  M5.Imu.getAccel(&lastAx, &lastAy, &lastAz);
  printLine("IMU ready for QR idle mode");
}

void enterQrIdleMode() {
  if (qrIdleMode) return;
  qrIdleMode = true;
  qrcode.setDecodeTrigger(false);
  drawScreen();
  printLine("QR idle: trigger off; display, WiFi, CPU, and uploader remain active");
}

void wakeQrScanner() {
  if (!qrIdleMode) return;
  qrIdleMode = false;
  stableSince = millis();
  qrcode.setDecodeTrigger(true);
  lastScanTriggerAt = millis();
  drawScreen();
  readyTone();
  printLine("QR scanner wake: motion or button detected");
}

void updateQrIdleMode(bool forceWake) {
  if (!imuReady) return;

  unsigned long now = millis();
  if (!forceWake && now - lastMotionCheckAt < MOTION_CHECK_INTERVAL_MS) return;
  lastMotionCheckAt = now;

  M5.Imu.update();
  float ax = lastAx;
  float ay = lastAy;
  float az = lastAz;
  M5.Imu.getAccel(&ax, &ay, &az);

  float deltaX = fabsf(ax - lastAx);
  float deltaY = fabsf(ay - lastAy);
  float deltaZ = fabsf(az - lastAz);
  lastAx = ax;
  lastAy = ay;
  lastAz = az;

  if (forceWake || qrMotionDetected(deltaX, deltaY, deltaZ, MOTION_WAKE_DELTA)) {
    stableSince = now;
    wakeQrScanner();
    return;
  }

  if (!qrIdleMode && now - stableSince >= QR_IDLE_AFTER_STABLE_MS) {
    enterQrIdleMode();
  }
}

void startWiFiConnection(bool showUi = false) {
  if (WiFi.status() == WL_CONNECTED) return;
  if (showUi) {
    displayStatus = "WIFI";
    uploadStatus = "CONNECT";
    drawScreen();
  }
  printLine("Starting non-blocking WiFi connection...");

  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.persistent(false);
  WiFi.setSleep(false);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  unsigned long now = millis();
  wifiReconnectStartedAt = now;
  nextWifiReconnectAt = now + WIFI_RECONNECT_INTERVAL_MS;
  wifiReconnectInProgress = true;
  if (showUi) drawWifiBadge(false);
}

void maintainWiFiConnection() {
  wl_status_t currentState = WiFi.status();
  bool connected = currentState == WL_CONNECTED;
  unsigned long now = millis();

  if (connected) {
    if (!wifiPreviouslyConnected) {
      wifiPreviouslyConnected = true;
      nextWifiReconnectAt = 0;
      wifiReconnectInProgress = false;
      wifiRecovered = true;
      printLine("WiFi restored: " + WiFi.localIP().toString() + " RSSI=" + String(WiFi.RSSI()));
      notifyUploadWorker();
    }
    return;
  }

  if (wifiPreviouslyConnected) printLine("WiFi connection lost; background reconnect enabled");
  wifiPreviouslyConnected = false;

  if (wifiReconnectInProgress) {
    if (now - wifiReconnectStartedAt < WIFI_RECONNECT_TIMEOUT_MS) return;
    wifiReconnectInProgress = false;
    WiFi.disconnect(false, false);
    nextWifiReconnectAt = now + WIFI_RECONNECT_INTERVAL_MS;
    printLine("WiFi connection attempt stalled; scheduling a fresh attempt");
    return;
  }

  // Do not restart an association/DHCP attempt that the WiFi stack owns.
  if (currentState == WL_IDLE_STATUS) return;

  if (nextWifiReconnectAt != 0 && static_cast<long>(now - nextWifiReconnectAt) < 0) return;
  startWiFiConnection();
}

bool synchronizeClock() {
  time_t now = time(nullptr);
  if (now > 1700000000) return true;
  if (static_cast<long>(millis() - nextNtpAttemptAt) < 0) return false;

  printLine("Synchronizing clock for TLS verification");
  configTime(0, 0, "pool.ntp.org", "time.google.com", "time.cloudflare.com");
  unsigned long startedAt = millis();
  while (WiFi.status() == WL_CONNECTED && millis() - startedAt < NTP_SYNC_TIMEOUT_MS) {
    now = time(nullptr);
    if (now > 1700000000) {
      printLine("Clock synchronized");
      return true;
    }
    delay(250);
  }

  nextNtpAttemptAt = millis() + MAX_RETRY_MS;
  printLine("Clock sync unavailable; HTTPS deferred");
  return false;
}

bool populateServerReply(JsonVariantConst value, ServerReply& reply) {
  if (!value.is<JsonObjectConst>()) return false;
  JsonObjectConst document = value.as<JsonObjectConst>();
  reply.success = document["success"].is<bool>() && document["success"].as<bool>();
  reply.scanId = document["scanId"].as<String>();
  reply.deviceId = document["deviceId"].as<String>();
  reply.receivedDecodedData = document["received"]["decodedData"].as<String>();
  reply.fullName = document["fullName"].as<String>();
  reply.enrollmentNo = document["enrollmentNo"].as<String>();
  reply.entryState = document["entryState"].as<String>();
  reply.persistenceStatus = document["persistence"]["status"].as<String>();
  String scanStatus = document["scanStatus"].as<String>();
  String message = document["message"].as<String>();
  String serverError = document["error"].as<String>();
  reply.error = serverError;
  reply.invalidQr = scanStatus == "invalid_qr" || message == "INVALID QR" || serverError.indexOf("Invalid QR") >= 0;
  return true;
}

bool parseServerReply(const String& response, ServerReply& reply) {
  JsonDocument filter;
  filter["success"] = true;
  filter["scanId"] = true;
  filter["deviceId"] = true;
  filter["fullName"] = true;
  filter["enrollmentNo"] = true;
  filter["entryState"] = true;
  filter["persistence"]["status"] = true;
  filter["received"]["decodedData"] = true;
  filter["scanStatus"] = true;
  filter["message"] = true;
  filter["error"] = true;

  JsonDocument document;
  DeserializationError error = deserializeJson(document, response, DeserializationOption::Filter(filter));
  if (error || !document.is<JsonObject>()) return false;
  return populateServerReply(document.as<JsonVariantConst>(), reply);
}

void relayWebSocketEvent(WStype_t type, uint8_t* payload, size_t length) {
  if (type == WStype_DISCONNECTED) {
    relayConnected = false;
    relayReady = false;
    return;
  }

  if (type == WStype_CONNECTED) {
    relayConnected = true;
    relayReady = false;
    JsonDocument auth;
    auth["v"] = 1;
    auth["type"] = "auth";
    auth["role"] = "scanner";
    auth["deviceId"] = DEVICE_ID;
    auth["apiKey"] = API_KEY;
    auth["macAddress"] = WiFi.macAddress();
    String message;
    serializeJson(auth, message);
    if (!relaySocket.sendTXT(message)) relaySocket.disconnect();
    return;
  }

  if (type != WStype_TEXT || length == 0 || length > 16 * 1024) return;
  JsonDocument document;
  if (deserializeJson(document, payload, length) || document["v"] != 1) return;
  String messageType = document["type"].as<String>();
  if (messageType == "ready" && document["role"] == "scanner") {
    relayReady = true;
    printLine("Realtime relay ready");
    notifyUploadWorker();
    return;
  }

  String scanId = document["scanId"].as<String>();
  if (scanId.length() == 0 || scanId != relayAwaitingScanId) return;
  if (messageType == "scan.ack") {
    ServerReply reply;
    bool parsed = populateServerReply(document["result"].as<JsonVariantConst>(), reply);
    int httpCode = document["httpStatus"] | 0;
    bool exactAcknowledgement = parsed && httpCode >= 200 && httpCode < 300 && reply.success && reply.scanId == scanId && reply.persistenceStatus == "saved";
    if (exactAcknowledgement) {
      relayAcknowledgedResult.outcome = UPLOAD_ACKNOWLEDGED;
      relayAcknowledgedResult.httpCode = httpCode;
      relayAcknowledgedResult.reply = reply;
      relayAttemptAcknowledged = true;
    }
    relayAttemptFinished = true;
  } else if (messageType == "scan.result") {
    relayAttemptFinished = true;
  }
}

void configureRealtimeRelay() {
  relayConfigured = strlen(RELAY_HOST) > 0 && RELAY_PATH[0] == '/';
  if (!relayConfigured) {
    printLine("Realtime relay not configured; HTTPS only");
    return;
  }
  relaySocket.onEvent(relayWebSocketEvent);
  relaySocket.setReconnectInterval(2000);
  relaySocket.enableHeartbeat(15000, 5000, 3);
  relaySocket.beginSslWithCA(RELAY_HOST, 443, RELAY_PATH, GTS_ROOT_R1);
  printLine("Realtime relay configured: " + String(RELAY_HOST));
}

bool uploadScanViaRelay(const ScanJob& pending, UploadResult& result) {
  QrRelayDecision decision = qrRelayDecision(relayConfigured, relayReady, false, false, 0, millis(), RELAY_ACK_TIMEOUT_MS);
  if (decision != QrRelayDecision::RELAY_SEND) return false;

  relayAttemptFinished = false;
  relayAttemptAcknowledged = false;
  snprintf(relayAwaitingScanId, sizeof(relayAwaitingScanId), "%s", pending.scanId);
  JsonDocument document;
  document["v"] = 1;
  document["type"] = "scan.submit";
  document["scanId"] = pending.scanId;
  document["decodedData"] = pending.decodedData;
  String payload;
  serializeJson(document, payload);
  if (!relaySocket.sendTXT(payload)) {
    relayAwaitingScanId[0] = '\0';
    return false;
  }

  unsigned long sentAt = millis();
  while (true) {
    relaySocket.loop();
    decision = qrRelayDecision(relayConfigured, relayReady, true, relayAttemptAcknowledged, sentAt, millis(), RELAY_ACK_TIMEOUT_MS);
    if (decision == QrRelayDecision::COMPLETE) {
      result = relayAcknowledgedResult;
      relayAwaitingScanId[0] = '\0';
      printLine("Realtime relay durable acknowledgement for " + String(pending.scanId));
      return true;
    }
    if (relayAttemptFinished || decision == QrRelayDecision::HTTPS_FALLBACK) break;
    delay(5);
  }

  relayAwaitingScanId[0] = '\0';
  printLine("Realtime relay unavailable or unacknowledged; using HTTPS fallback");
  return false;
}

UploadResult uploadScan(const ScanJob& pending) {
  UploadResult result;
  result.outcome = UPLOAD_RETRY;
  result.httpCode = -1;

  if (!synchronizeClock()) return result;

  WiFiClientSecure client;
  client.setCACert(ISRG_ROOT_X1);

  HTTPClient http;
  http.setConnectTimeout(6000);
  http.setTimeout(15000);
  if (!http.begin(client, API_URL)) {
    printLine("Scan upload HTTP initialization failed");
    return result;
  }

  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-API-Key", String(API_KEY));

  JsonDocument document;
  document["deviceId"] = DEVICE_ID;
  document["macAddress"] = WiFi.macAddress();
  document["scanId"] = pending.scanId;
  document["decodedData"] = pending.decodedData;
  String payload;
  size_t expectedPayloadBytes = measureJson(document);
  size_t payloadBytes = serializeJson(document, payload);
  if (payloadBytes != expectedPayloadBytes) {
    printLine("Scan upload payload serialization failed; retaining queue record");
    http.end();
    return result;
  }

  printLine("POST scanId=" + String(pending.scanId) + " queue=" + String(pendingScanCount()));
  int code = http.POST(payload);
  result.httpCode = code;
  Serial.printf("HTTP response: %d\n", code);
  if (code <= 0) printLine("Transport error: " + http.errorToString(code));

  int responseBytes = http.getSize();
  bool responseTooLarge = responseBytes > static_cast<int>(MAX_SERVER_RESPONSE_BYTES);
  BoundedResponseStream response(MAX_SERVER_RESPONSE_BYTES);
  int streamedBytes = code > 0 && !responseTooLarge ? http.writeToStream(&response) : -1;
  if (responseTooLarge || response.overflowed()) printLine("Server response too large; retaining queue record");
  else if (code > 0 && streamedBytes < 0) printLine("Server response stream failed; retaining queue record");
  bool parsed = code > 0 && !responseTooLarge && !response.overflowed() && streamedBytes >= 0 && parseServerReply(response.data(), result.reply);
  bool exactAcknowledgement = parsed && result.reply.success && result.reply.scanId == pending.scanId && result.reply.persistenceStatus == "saved";
  bool scanIdCollision = parsed && result.reply.error.indexOf("scanId") >= 0;
  if (exactAcknowledgement && code >= 200 && code < 300) {
    result.outcome = UPLOAD_ACKNOWLEDGED;
  } else if (result.reply.invalidQr || code == 422 || code == 413 || (code == 409 && scanIdCollision)) {
    result.outcome = UPLOAD_INVALID;
  } else if (code == 400 || code == 401 || code == 403 || code == 409) {
    result.outcome = UPLOAD_BLOCKED;
  } else {
    result.outcome = UPLOAD_RETRY;
  }

  if (code >= 200 && code < 300 && result.outcome != UPLOAD_ACKNOWLEDGED) {
    String idStatus = !parsed ? "unparsed" : (result.reply.scanId.length() == 0 ? "missing" : (result.reply.scanId == pending.scanId ? "match" : "mismatch"));
    printLine("Saved acknowledgement incomplete: id=" + idStatus + " persistence=" + (result.reply.persistenceStatus.length() ? result.reply.persistenceStatus : "missing"));
  }

  http.end();
  return result;
}

void scheduleUploadRetry() {
  nextUploadAttemptAt = millis() + uploadRetryMs;
  uploadRetryMs = min(uploadRetryMs * 2, MAX_RETRY_MS);
}

void copyEventText(char* target, size_t targetSize, const String& value) {
  snprintf(target, targetSize, "%s", value.c_str());
}

void publishUploadUiEvent(UploadUiEventType type, int httpCode, const ScanJob* pending = nullptr, const ServerReply* reply = nullptr) {
  if (uploadUiQueue == nullptr) return;
  UploadUiEvent event = {};
  event.type = type;
  event.httpCode = httpCode;
  if (pending != nullptr) snprintf(event.scanId, sizeof(event.scanId), "%s", pending->scanId);
  if (reply != nullptr) {
    copyEventText(event.fullName, sizeof(event.fullName), reply->fullName);
    copyEventText(event.enrollmentNo, sizeof(event.enrollmentNo), reply->enrollmentNo);
    copyEventText(event.entryState, sizeof(event.entryState), reply->entryState);
  }
  xQueueSend(uploadUiQueue, &event, portMAX_DELAY);
}

void processPendingQueueOnce() {
  if (scanQueue == nullptr || pendingScanCount() == 0) return;

  ScanJob pending = {};
  if (xQueuePeek(scanQueue, &pending, 0) != pdTRUE) {
    publishUploadUiEvent(UPLOAD_UI_QUEUE_ERROR, -1);
    scheduleUploadRetry();
    return;
  }

  if (WiFi.status() != WL_CONNECTED) {
    printQueueCounts("offline; retry retained");
    publishUploadUiEvent(UPLOAD_UI_RETRY, 0, &pending);
    scheduleUploadRetry();
    return;
  }

  UploadResult result;
  if (!uploadScanViaRelay(pending, result)) result = uploadScan(pending);
  if (result.outcome == UPLOAD_ACKNOWLEDGED) {
    ScanJob removed = {};
    if (xQueueReceive(scanQueue, &removed, 0) != pdTRUE) {
      publishUploadUiEvent(UPLOAD_UI_QUEUE_ERROR, result.httpCode, &pending);
      scheduleUploadRetry();
      return;
    }

    uploadRetryMs = INITIAL_RETRY_MS;
    nextUploadAttemptAt = millis() + 100;
    printLine("Durable cloud acknowledgement for " + String(pending.scanId));
    printQueueCounts("after cloud save");
    publishUploadUiEvent(UPLOAD_UI_ACKNOWLEDGED, result.httpCode, &pending, &result.reply);
    return;
  }

  if (result.outcome == UPLOAD_INVALID) {
    ScanJob removed = {};
    if (xQueueReceive(scanQueue, &removed, 0) != pdTRUE) {
      publishUploadUiEvent(UPLOAD_UI_QUEUE_ERROR, result.httpCode, &pending);
      scheduleUploadRetry();
      return;
    }
    uploadRetryMs = INITIAL_RETRY_MS;
    nextUploadAttemptAt = millis() + 100;
    publishUploadUiEvent(UPLOAD_UI_INVALID, result.httpCode, &pending, &result.reply);
    return;
  }

  printQueueCounts(result.outcome == UPLOAD_BLOCKED ? "blocked; retry retained" : "upload failed; retry retained");
  publishUploadUiEvent(result.outcome == UPLOAD_BLOCKED ? UPLOAD_UI_BLOCKED : UPLOAD_UI_RETRY, result.httpCode, &pending, &result.reply);
  if (result.outcome == UPLOAD_BLOCKED) {
    nextUploadAttemptAt = millis() + MAX_RETRY_MS;
    uploadRetryMs = MAX_RETRY_MS;
    printLine("Device provisioning rejected; retrying in 60 seconds");
    return;
  }
  scheduleUploadRetry();
}

void uploadWorkerTask(void*) {
  configureRealtimeRelay();
  bool idleReported = false;
  while (true) {
    if (relayConfigured && WiFi.status() == WL_CONNECTED) relaySocket.loop();
    if (wifiRecovered) {
      wifiRecovered = false;
      nextUploadAttemptAt = 0;
      nextNtpAttemptAt = 0;
      configTime(0, 0, "pool.ntp.org", "time.google.com", "time.cloudflare.com");
    }

    if (scanQueue == nullptr || pendingScanCount() == 0) {
      if (!idleReported) {
        printQueueCounts("drained; uploader idle");
        idleReported = true;
      }
      ulTaskNotifyTake(pdTRUE, relayConfigured ? pdMS_TO_TICKS(20) : portMAX_DELAY);
      uploadRetryMs = INITIAL_RETRY_MS;
      nextUploadAttemptAt = 0;
      continue;
    }
    idleReported = false;

    long waitMs = static_cast<long>(nextUploadAttemptAt - millis());
    if (waitMs > 0) {
      long maximumWait = relayConfigured ? 20L : 1000L;
      ulTaskNotifyTake(pdTRUE, pdMS_TO_TICKS(min(waitMs, maximumWait)));
      continue;
    }
    processPendingQueueOnce();
  }
}

void notifyUploadWorker() {
  if (uploadTaskHandle != nullptr) xTaskNotifyGive(uploadTaskHandle);
}

void handleUploadUiEvents() {
  if (uploadUiQueue == nullptr) return;
  UploadUiEvent event;
  while (xQueueReceive(uploadUiQueue, &event, 0) == pdTRUE) {
    bool isCurrentScan = event.scanId[0] != '\0' && lastScanId == event.scanId;
    size_t livePending = pendingScanCount();
    if (event.type == UPLOAD_UI_ACKNOWLEDGED) {
      if (isCurrentScan) {
        if (event.fullName[0] != '\0') lastStudentName = event.fullName;
        if (event.enrollmentNo[0] != '\0') lastEnrollment = event.enrollmentNo;
        if (strcmp(event.entryState, "IN") == 0 || strcmp(event.entryState, "OUT") == 0) lastEntryState = event.entryState;
        displayStatus = lastEntryState.length() ? lastEntryState : "MARKED";
      }
      uploadStatus = livePending == 0 ? "UPLOADED" : "Q:" + String(livePending) + " LEFT";
      drawScreen();
      if (isCurrentScan) successTone();
    } else if (event.type == UPLOAD_UI_INVALID) {
      sessionFailedCount++;
      if (isCurrentScan) showInvalidQr();
      else {
        uploadStatus = "REJECTED";
        drawScreen();
      }
    } else if (event.type == UPLOAD_UI_BLOCKED) {
      displayStatus = "CONFIG ERR";
      if (event.httpCode == 401 || event.httpCode == 403) uploadStatus = "BAD KEY";
      else if (event.httpCode == 409) uploadStatus = "MAC/ID ERR";
      else uploadStatus = "PAYLOAD ERR";
      drawScreen();
    } else if (event.type == UPLOAD_UI_RETRY) {
      displayStatus = event.httpCode == 0 ? "OFFLINE" : "RETRY";
      uploadStatus = "Q:" + String(livePending) + (event.httpCode == 0 ? " OFFLINE" : " RETRY");
      drawScreen();
    } else {
      uploadStatus = "RAM Q ERR";
      drawScreen();
    }
  }
}

void setup() {
  auto cfg = M5.config();
  cfg.internal_imu = true;
  M5.begin(cfg);
  Serial.begin(115200);
  printLine("Serial monitor: 115200 baud");
  M5.Speaker.setVolume(180);

  M5.Display.setRotation(0);
  M5.Display.setBrightness(140);
  initMotionSensor();
  M5.update();
  scanQueue = xQueueCreateStatic(SCAN_QUEUE_DEPTH, sizeof(ScanJob), scanQueueStorage, &scanQueueControl);
  uploadUiQueue = xQueueCreate(8, sizeof(UploadUiEvent));
  displayStatus = "BOOT";
  uploadStatus = scanQueue != nullptr && uploadUiQueue != nullptr ? "STARTING" : "RAM FAIL";
  drawScreen();
  startupTone();

  printLine("QR Logger ICC boot");
  printLine("Device: " + String(DEVICE_ID));
  printLine("Dashboard: " + String(DASHBOARD_URL));
  startWiFiConnection(true);

  while (!qrcode.begin(&Serial1, 115200, QR_UART_RX_PIN, QR_UART_TX_PIN)) {
    displayStatus = "QR FAIL";
    uploadStatus = "INIT FAIL";
    drawScreen();
    printLine("QRCode init fail");
    failTone();
    delay(1000);
  }

  printLine("QRCode init success");
  qrcode.setTriggerMode(MANUAL_SCAN_MODE);
  qrcode.setDecodeTrigger(true);
  lastScanTriggerAt = millis();
  displayStatus = scanQueue != nullptr && uploadUiQueue != nullptr ? "READY" : "RAM FAIL";
  uploadStatus = scanQueue != nullptr && uploadUiQueue != nullptr ? "SCAN QR" : "NO QUEUE";
  drawScreen();
  readyTone();

  if (scanQueue != nullptr && uploadUiQueue != nullptr) {
    BaseType_t taskCreated = xTaskCreatePinnedToCore(uploadWorkerTask, "qr-upload", 16384, nullptr, 1, &uploadTaskHandle, 0);
    if (taskCreated != pdPASS) {
      uploadTaskHandle = nullptr;
      uploadStatus = "TASK FAIL";
      drawScreen();
      printLine("Upload worker creation failed; RAM queue cannot sync");
    }
  }
}

void loop() {
  M5.update();
  handleUploadUiEvents();
  maintainWiFiConnection();
  bool buttonPressed = M5.BtnA.wasPressed();

  updateQrIdleMode(buttonPressed);

  if (qrIdleMode) {
    refreshWifiBadge();
    delay(20);
    return;
  }

  if (qrTriggerDue(qrIdleMode, buttonPressed, millis(), lastScanTriggerAt, SCAN_TRIGGER_INTERVAL_MS)) {
    lastScanTriggerAt = millis();
    qrcode.setDecodeTrigger(true);
  }

  String data = readQrFrame();
  if (data.length() > 0) {
    bool validQr = isValidDoswStudentQr(data);
    bool duplicate = data == lastDecoded && (millis() - lastDecodedAt) < DUPLICATE_SUPPRESS_MS;

    Serial.printf("QR decoded: %d bytes\n", data.length());

    if (!validQr) {
      Serial.println("Invalid QR: rejected on device before POST");
      showInvalidQr();
    } else if (duplicate) {
      displayStatus = "DUP";
      uploadStatus = "DUP SKIP";
      drawScreen();
    } else {
      Serial.printf("Valid QR accepted; RAM pending=%u\n", static_cast<unsigned int>(pendingScanCount()));
      ScanJob job = {};
      bool queued = uploadTaskHandle != nullptr && enqueueScan(data, job);
      lastStudentName = "";
      lastEnrollment = "";
      lastEntryState = "";
      stableSince = millis();

      if (queued) {
        lastDecoded = data;
        lastScanId = job.scanId;
        lastDecodedAt = millis();
        displayStatus = "SCANNED";
        uploadStatus = "Q:" + String(pendingScanCount()) + " CLOUD";
        drawScreen();
        notifyUploadWorker();
      } else {
        sessionFailedCount++;
        printLine("Scan rejected: volatile upload queue is full or unavailable");
        displayStatus = "Q FULL";
        uploadStatus = "TRY AGAIN";
        drawScreen();
        failTone();
      }
    }
  }

  refreshWifiBadge();
  delay(10);
}
