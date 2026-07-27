#include <M5Unified.h>
#include "M5UnitQRCode.h"
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <LittleFS.h>
#include <Preferences.h>
#include <esp_system.h>
#include <freertos/FreeRTOS.h>
#include <freertos/queue.h>
#include <freertos/semphr.h>
#include <freertos/task.h>
#include <math.h>
#include <time.h>
#include "secrets.h"

M5UnitQRCodeUART qrcode;

// -------- API CONFIG --------
const char* API_URL = "https://iitrlogger.com/api/qr-biometric-icc";
const char* DASHBOARD_URL = "https://iitrlogger.com";
const char* DEVICE_ID = "QRB-001";

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

// -------- QR UART CONFIG --------
#define UART_TX 5
#define UART_RX 6

String lastDecoded = "";
String lastStudentName = "";
String lastEnrollment = "";
String lastEntryState = "";
String lastScanId = "";
String displayStatus = "BOOT";
String uploadStatus = "WAIT";
bool sleepMode = false;
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
const unsigned long SLEEP_AFTER_STABLE_MS = 10000;
const unsigned long MOTION_CHECK_INTERVAL_MS = 200;
const float MOTION_WAKE_DELTA = 0.08f;
const size_t MAX_DECODED_DATA_LENGTH = 512;
const size_t MAX_PENDING_SCANS = 128;
const size_t MAX_FAILED_SCANS = 32;
const size_t MAX_FAILED_BYTES = 64 * 1024;
const size_t MAX_CACHED_PROFILES = 64;
const size_t PROFILE_QUEUE_RESERVE_BYTES = 128 * 1024;
const size_t MIN_QUEUE_WRITE_BYTES = 4096;
const size_t MAX_SERVER_RESPONSE_BYTES = 32 * 1024;
const unsigned long INITIAL_RETRY_MS = 2000;
const unsigned long MAX_RETRY_MS = 60000;
const unsigned long NTP_SYNC_TIMEOUT_MS = 10000;
const bool ALLOW_LEGACY_SAVED_ACK = true;  // Disable after the scanId-enabled API is deployed everywhere.

bool storageReady = false;
volatile size_t pendingScanCount = 0;
volatile size_t failedScanCount = 0;
volatile bool uploadProvisioningBlocked = false;
volatile int uploadBlockedHttpCode = 0;
unsigned long nextUploadAttemptAt = 0;
unsigned long uploadRetryMs = INITIAL_RETRY_MS;
unsigned long nextNtpAttemptAt = 0;
SemaphoreHandle_t storageMutex = nullptr;
QueueHandle_t uploadUiQueue = nullptr;
TaskHandle_t uploadTaskHandle = nullptr;

struct PendingScan {
  String path;
  String scanId;
  String decodedData;
};

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

enum UploadUiEventType : uint8_t {
  UPLOAD_UI_ACKNOWLEDGED,
  UPLOAD_UI_INVALID,
  UPLOAD_UI_BLOCKED,
  UPLOAD_UI_RETRY,
  UPLOAD_UI_STORAGE_ERROR
};

struct UploadUiEvent {
  UploadUiEventType type;
  int httpCode;
  size_t pending;
  size_t failed;
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
    M5.Display.print("DATA:");
    drawWrappedText(lastDecoded, 64, 4);
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
  M5.Display.print("QR ICC");
  drawWifiBadge(wifiOk);

  M5.Display.drawFastHLine(0, 22, M5.Display.width(), COLOR_DIM);

  if (sleepMode) {
    M5.Display.setTextSize(2);
    M5.Display.setTextColor(COLOR_WARN, COLOR_BG);
    M5.Display.setCursor(8, 34);
    M5.Display.print("SLEEP");
    M5.Display.setTextSize(1);
    M5.Display.setTextColor(COLOR_TEXT, COLOR_BG);
    M5.Display.setCursor(8, 62);
    M5.Display.print("QR OFF");
    M5.Display.setTextColor(COLOR_DIM, COLOR_BG);
    M5.Display.setCursor(8, 78);
    M5.Display.print("MOVE TO WAKE");
    M5.Display.setCursor(8, 94);
    M5.Display.print("BTN ALSO WAKES");
    M5.Display.drawFastHLine(0, 114, M5.Display.width(), COLOR_DIM);
    M5.Display.setCursor(6, 118);
    M5.Display.print(imuReady ? "IMU SLEEP" : "NO IMU");
    return;
  }

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
  M5.Display.print(pendingScanCount);
  M5.Display.print(" F:");
  M5.Display.print(failedScanCount);
}

void printLine(const String& msg) {
  Serial.println(msg);
}

void printQueueCounts(const char* reason) {
  Serial.printf("Queue %s: pending=%u failed=%u\n", reason, static_cast<unsigned int>(pendingScanCount), static_cast<unsigned int>(failedScanCount));
}

bool lockStorage() {
  return storageMutex != nullptr && xSemaphoreTake(storageMutex, portMAX_DELAY) == pdTRUE;
}

void unlockStorage() {
  xSemaphoreGive(storageMutex);
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

bool isPendingFileName(const String& path) {
  return path.endsWith(".json") && path.indexOf("/queue/") >= 0;
}

String filePathInDirectory(File& file, const String& directory) {
  String path = file.name();
  if (!path.startsWith("/")) path = directory + "/" + path;
  return path;
}

bool countPendingScans(size_t& count) {
  count = 0;
  if (!storageReady) return false;
  File directory = LittleFS.open("/queue");
  if (!directory || !directory.isDirectory()) return false;

  File file = directory.openNextFile();
  while (file) {
    String path = filePathInDirectory(file, "/queue");
    if (!file.isDirectory() && isPendingFileName(path)) count++;
    file.close();
    file = directory.openNextFile();
  }
  directory.close();
  return true;
}

size_t countJsonFiles(const String& directoryPath) {
  if (!storageReady) return 0;
  File directory = LittleFS.open(directoryPath);
  if (!directory || !directory.isDirectory()) return 0;

  size_t count = 0;
  File file = directory.openNextFile();
  while (file) {
    String path = filePathInDirectory(file, directoryPath);
    if (!file.isDirectory() && path.endsWith(".json")) count++;
    file.close();
    file = directory.openNextFile();
  }
  directory.close();
  return count;
}

size_t directoryFileBytes(const String& directoryPath) {
  if (!storageReady) return 0;
  File directory = LittleFS.open(directoryPath);
  if (!directory || !directory.isDirectory()) return 0;

  size_t bytes = 0;
  File file = directory.openNextFile();
  while (file) {
    if (!file.isDirectory()) bytes += file.size();
    file.close();
    file = directory.openNextFile();
  }
  directory.close();
  return bytes;
}

void cleanupTemporaryFiles(const String& directoryPath) {
  File directory = LittleFS.open(directoryPath);
  if (!directory || !directory.isDirectory()) return;
  File file = directory.openNextFile();
  while (file) {
    String path = filePathInDirectory(file, directoryPath);
    bool incomplete = !file.isDirectory() && path.endsWith(".tmp");
    file.close();
    if (incomplete) LittleFS.remove(path);
    file = directory.openNextFile();
  }
  directory.close();
}

bool readQueueRecord(File& file, String& scanId, String& decodedData) {
  if (!file) return false;
  JsonDocument document;
  DeserializationError error = deserializeJson(document, file);
  scanId = document["scanId"].as<String>();
  decodedData = document["decodedData"].as<String>();
  bool validScanId = scanId.length() == 24;
  for (size_t i = 0; validScanId && i < scanId.length(); i++) validScanId = isxdigit(static_cast<unsigned char>(scanId.charAt(i)));
  return !error && validScanId && decodedData.length() > 0 && decodedData.length() <= MAX_DECODED_DATA_LENGTH;
}

bool preserveInvalidTemporaryRecord(const String& temporaryPath, size_t recordBytes) {
  if (countJsonFiles("/failed") >= MAX_FAILED_SCANS || directoryFileBytes("/failed") + recordBytes > MAX_FAILED_BYTES) return false;
  int separator = temporaryPath.lastIndexOf('/');
  String fileName = separator >= 0 ? temporaryPath.substring(separator + 1) : temporaryPath;
  if (fileName.endsWith(".tmp")) fileName.remove(fileName.length() - 4);
  String failedPath = "/failed/recovery-" + fileName;
  if (LittleFS.exists(failedPath)) failedPath = "/failed/recovery-" + String(millis()) + "-" + fileName;
  return LittleFS.rename(temporaryPath, failedPath);
}

bool recoverQueueTemporaryFiles() {
  File directory = LittleFS.open("/queue");
  if (!directory || !directory.isDirectory()) return false;
  bool recovered = true;
  File file = directory.openNextFile();
  while (file) {
    String temporaryPath = filePathInDirectory(file, "/queue");
    bool temporaryRecord = !file.isDirectory() && temporaryPath.endsWith(".json.tmp");
    size_t recordBytes = file.size();
    String scanId;
    String decodedData;
    bool validTemporary = temporaryRecord && readQueueRecord(file, scanId, decodedData);
    file.close();

    if (temporaryRecord) {
      String finalPath = temporaryPath.substring(0, temporaryPath.length() - 4);
      if (LittleFS.exists(finalPath)) {
        File finalFile = LittleFS.open(finalPath, "r");
        String finalScanId;
        String finalDecodedData;
        bool sameFinalRecord = validTemporary && readQueueRecord(finalFile, finalScanId, finalDecodedData) && finalScanId == scanId && finalDecodedData == decodedData;
        if (finalFile) finalFile.close();
        if (sameFinalRecord) {
          if (!LittleFS.remove(temporaryPath)) recovered = false;
        } else if (!preserveInvalidTemporaryRecord(temporaryPath, recordBytes)) {
          recovered = false;
        }
      } else if (validTemporary && LittleFS.rename(temporaryPath, finalPath)) {
        printLine("Recovered complete queue record after interrupted rename");
      } else if (validTemporary) {
        recovered = false;
        printLine("Queue temporary rename failed; record retained for recovery");
      } else if (preserveInvalidTemporaryRecord(temporaryPath, recordBytes)) {
        printLine("Preserved incomplete queue record in failed storage");
      } else {
        recovered = false;
        printLine("Could not preserve incomplete queue record; original retained");
      }
    }
    file = directory.openNextFile();
  }
  directory.close();
  return recovered;
}

bool evictOneCachedProfile() {
  File directory = LittleFS.open("/profiles");
  if (!directory || !directory.isDirectory()) return false;
  String selectedPath;
  File file = directory.openNextFile();
  while (file) {
    String path = filePathInDirectory(file, "/profiles");
    if (!file.isDirectory() && path.endsWith(".json") && (selectedPath.length() == 0 || path < selectedPath)) selectedPath = path;
    file.close();
    file = directory.openNextFile();
  }
  directory.close();
  return selectedPath.length() > 0 && LittleFS.remove(selectedPath);
}

bool ensureQueueWriteSpace() {
  while (LittleFS.totalBytes() - LittleFS.usedBytes() < MIN_QUEUE_WRITE_BYTES) {
    if (!evictOneCachedProfile()) return false;
  }
  return true;
}

bool quarantineQueueRecord(const String& queuePath, const String& reason) {
  File source = LittleFS.open(queuePath, "r");
  size_t sourceBytes = source ? source.size() : 0;
  if (source) source.close();
  if (failedScanCount >= MAX_FAILED_SCANS || directoryFileBytes("/failed") + sourceBytes > MAX_FAILED_BYTES) {
    printLine("Failed-record storage full; retaining queue head: " + reason);
    return false;
  }

  int separator = queuePath.lastIndexOf('/');
  String fileName = separator >= 0 ? queuePath.substring(separator + 1) : queuePath;
  String failedPath = "/failed/" + fileName;
  if (LittleFS.exists(failedPath)) failedPath = "/failed/" + String(millis()) + "-" + fileName;
  if (!LittleFS.rename(queuePath, failedPath)) {
    printLine("Failed to quarantine " + queuePath + ": " + reason);
    return false;
  }
  if (pendingScanCount > 0) pendingScanCount--;
  failedScanCount++;
  printLine("Quarantined " + fileName + ": " + reason);
  printQueueCounts("after quarantine");
  return true;
}

bool initializeStorage() {
  Preferences preferences;
  preferences.begin("qrlogger", false);
  bool wasInitialized = preferences.getBool("fsInit", false);
  bool mounted = LittleFS.begin(false);

  if (!mounted && !wasInitialized && M5.BtnA.isPressed()) {
    printLine("Formatting LittleFS after boot-button confirmation");
    mounted = LittleFS.format() && LittleFS.begin(false);
  }

  if (!mounted) {
    preferences.end();
    printLine("LittleFS mount failed; refusing to format existing storage");
    return false;
  }

  if (!LittleFS.exists("/queue")) LittleFS.mkdir("/queue");
  if (!LittleFS.exists("/profiles")) LittleFS.mkdir("/profiles");
  if (!LittleFS.exists("/failed")) LittleFS.mkdir("/failed");
  preferences.putBool("fsInit", true);
  preferences.end();

  storageReady = true;
  if (!recoverQueueTemporaryFiles()) {
    printLine("LittleFS queue recovery incomplete; storage disabled without deleting records");
    storageReady = false;
    return false;
  }
  cleanupTemporaryFiles("/profiles");
  size_t currentPending = 0;
  if (!countPendingScans(currentPending)) {
    printLine("LittleFS queue enumeration failed");
    storageReady = false;
    return false;
  }
  pendingScanCount = currentPending;
  failedScanCount = countJsonFiles("/failed");
  Serial.printf("LittleFS ready: %u pending, %u failed, %u/%u bytes used\n", pendingScanCount, failedScanCount, LittleFS.usedBytes(), LittleFS.totalBytes());
  printQueueCounts("at boot");
  return true;
}

String generateScanId() {
  uint8_t bytes[12];
  esp_fill_random(bytes, sizeof(bytes));
  const char* hex = "0123456789abcdef";
  char id[25];
  for (size_t i = 0; i < sizeof(bytes); i++) {
    id[i * 2] = hex[bytes[i] >> 4];
    id[i * 2 + 1] = hex[bytes[i] & 0x0f];
  }
  id[24] = '\0';
  return String(id);
}

unsigned long nextQueueSequence() {
  Preferences preferences;
  preferences.begin("qrlogger", false);
  unsigned long sequence = preferences.getULong("queueSeq", 0) + 1;
  preferences.putULong("queueSeq", sequence);
  preferences.end();
  return sequence;
}

bool enqueueScan(const String& decodedData, String& scanId) {
  if (!storageReady || pendingScanCount >= MAX_PENDING_SCANS || !ensureQueueWriteSpace()) return false;

  scanId = generateScanId();
  char sequence[11];
  snprintf(sequence, sizeof(sequence), "%010lu", nextQueueSequence());
  String finalPath = "/queue/" + String(sequence) + "-" + scanId + ".json";
  String temporaryPath = finalPath + ".tmp";

  JsonDocument document;
  document["version"] = 1;
  document["scanId"] = scanId;
  document["decodedData"] = decodedData;

  File file = LittleFS.open(temporaryPath, "w");
  if (!file) return false;
  size_t expectedBytes = measureJson(document);
  size_t writtenBytes = serializeJson(document, file);
  file.flush();
  size_t storedBytes = file.size();
  bool writeFailed = file.getWriteError() != 0;
  file.close();
  bool complete = !writeFailed && writtenBytes == expectedBytes && storedBytes == expectedBytes;
  if (!complete || !LittleFS.rename(temporaryPath, finalPath)) {
    LittleFS.remove(temporaryPath);
    return false;
  }

  pendingScanCount++;
  printLine("Scan persisted as " + scanId);
  printQueueCounts("after persist");
  return true;
}

bool loadOldestPendingScan(PendingScan& pending) {
  if (!storageReady) return false;
  while (pendingScanCount > 0) {
    File directory = LittleFS.open("/queue");
    if (!directory || !directory.isDirectory()) return false;

    String oldestPath;
    File file = directory.openNextFile();
    while (file) {
      String path = filePathInDirectory(file, "/queue");
      if (!file.isDirectory() && isPendingFileName(path) && (oldestPath.length() == 0 || path < oldestPath)) oldestPath = path;
      file.close();
      file = directory.openNextFile();
    }
    directory.close();
    if (oldestPath.length() == 0) return false;

    File record = LittleFS.open(oldestPath, "r");
    JsonDocument document;
    DeserializationError error = record ? deserializeJson(document, record) : DeserializationError::EmptyInput;
    if (record) record.close();
    String scanId = document["scanId"].as<String>();
    String decodedData = document["decodedData"].as<String>();
    bool validScanId = scanId.length() == 24;
    for (size_t i = 0; validScanId && i < scanId.length(); i++) validScanId = isxdigit(static_cast<unsigned char>(scanId.charAt(i)));

    if (error || !validScanId || decodedData.length() == 0) {
      if (!quarantineQueueRecord(oldestPath, error ? error.c_str() : "invalid queue fields")) return false;
      return false;
    }

    pending.path = oldestPath;
    pending.scanId = scanId;
    pending.decodedData = decodedData;
    return true;
  }
  return false;
}

String profileCachePath(const String& decodedData) {
  uint32_t high = 2166136261UL;
  uint32_t low = 2166136261UL;
  for (size_t i = 0; i < decodedData.length(); i++) {
    uint8_t value = static_cast<uint8_t>(decodedData.charAt(i));
    low = (low ^ value) * 16777619UL;
    high = (high ^ (value + static_cast<uint8_t>(i))) * 16777619UL;
  }
  char hash[17];
  snprintf(hash, sizeof(hash), "%08lx%08lx", high, low);
  return "/profiles/" + String(hash) + ".json";
}

bool loadCachedProfile(const String& decodedData, String& fullName, String& enrollmentNo) {
  if (!storageReady) return false;
  File file = LittleFS.open(profileCachePath(decodedData), "r");
  if (!file) return false;
  JsonDocument document;
  DeserializationError error = deserializeJson(document, file);
  file.close();
  if (error || document["decodedData"].as<String>() != decodedData) return false;
  fullName = document["fullName"].as<String>();
  enrollmentNo = document["enrollmentNo"].as<String>();
  return fullName.length() > 0 || enrollmentNo.length() > 0;
}

bool prepareProfileCacheWrite(const String& finalPath) {
  while ((!LittleFS.exists(finalPath) && countJsonFiles("/profiles") >= MAX_CACHED_PROFILES) ||
         LittleFS.totalBytes() - LittleFS.usedBytes() < PROFILE_QUEUE_RESERVE_BYTES + 2048) {
    if (!evictOneCachedProfile()) return false;
  }
  return true;
}

bool saveCachedProfile(const String& decodedData, const String& fullName, const String& enrollmentNo) {
  if (!storageReady || (fullName.length() == 0 && enrollmentNo.length() == 0)) return false;
  String finalPath = profileCachePath(decodedData);
  if (!prepareProfileCacheWrite(finalPath)) {
    printLine("Profile cache skipped to preserve queue space");
    return false;
  }
  String temporaryPath = finalPath + ".tmp";
  JsonDocument document;
  document["decodedData"] = decodedData;
  document["fullName"] = fullName;
  document["enrollmentNo"] = enrollmentNo;

  File file = LittleFS.open(temporaryPath, "w");
  if (!file) return false;
  bool written = serializeJson(document, file) > 0;
  file.flush();
  file.close();
  if (written) {
    LittleFS.remove(finalPath);
    if (LittleFS.rename(temporaryPath, finalPath)) return true;
    LittleFS.remove(temporaryPath);
  } else {
    LittleFS.remove(temporaryPath);
  }
  return false;
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
    printLine("IMU not found; motion sleep disabled");
    return;
  }

  M5.Imu.update();
  M5.Imu.getAccel(&lastAx, &lastAy, &lastAz);
  printLine("IMU ready for motion sleep");
}

void enterSleepMode() {
  if (sleepMode) return;
  sleepMode = true;
  qrcode.setDecodeTrigger(false);
  displayStatus = "SLEEP";
  uploadStatus = "QR OFF";
  M5.Display.setBrightness(30);
  drawScreen();
  printLine("Sleep mode: QR trigger off");
}

void wakeFromMotion() {
  if (!sleepMode) return;
  sleepMode = false;
  stableSince = millis();
  lastScanTriggerAt = 0;
  displayStatus = "READY";
  uploadStatus = "SCAN QR";
  M5.Display.setBrightness(140);
  drawScreen();
  readyTone();
  printLine("Wake: motion detected");
}

void updateMotionSleep(bool forceWake) {
  if (!imuReady) return;

  unsigned long now = millis();
  if (!forceWake && now - lastMotionCheckAt < MOTION_CHECK_INTERVAL_MS) return;
  lastMotionCheckAt = now;

  M5.Imu.update();
  float ax = lastAx;
  float ay = lastAy;
  float az = lastAz;
  M5.Imu.getAccel(&ax, &ay, &az);

  float delta = fabsf(ax - lastAx) + fabsf(ay - lastAy) + fabsf(az - lastAz);
  lastAx = ax;
  lastAy = ay;
  lastAz = az;

  if (forceWake || delta > MOTION_WAKE_DELTA) {
    stableSince = now;
    wakeFromMotion();
    return;
  }

  if (!sleepMode && now - stableSince >= SLEEP_AFTER_STABLE_MS) {
    enterSleepMode();
  }
}

void connectWiFi() {
  if (WiFi.status() == WL_CONNECTED) return;

  displayStatus = "WIFI";
  uploadStatus = "CONNECT";
  drawScreen();
  printLine("Connecting WiFi...");

  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.persistent(false);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  int retries = 0;
  while (WiFi.status() != WL_CONNECTED && retries < 24) {
    delay(500);
    Serial.print(".");
    retries++;
    drawWifiBadge(false);
  }

  if (WiFi.status() == WL_CONNECTED) {
    printLine("WiFi OK: " + WiFi.localIP().toString());
    printLine("WiFi MAC: " + WiFi.macAddress());
    uploadStatus = "WIFI OK";
    drawScreen();
    readyTone();
  } else {
    printLine("WiFi timeout");
    uploadStatus = "WIFI FAIL";
    drawScreen();
    failTone();
  }
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

UploadResult uploadPendingScan(const PendingScan& pending) {
  UploadResult result;
  result.outcome = UPLOAD_RETRY;
  result.httpCode = -1;

  if (!synchronizeClock()) return result;

  WiFiClientSecure client;
  client.setCACert(ISRG_ROOT_X1);

  HTTPClient http;
  http.setConnectTimeout(6000);
  http.setTimeout(12000);
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

  printLine("POST scanId=" + pending.scanId + " queue=" + String(pendingScanCount));
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
  bool legacyAcknowledgement = ALLOW_LEGACY_SAVED_ACK && parsed && result.reply.success && result.reply.scanId.length() == 0 &&
                               result.reply.deviceId == DEVICE_ID && result.reply.receivedDecodedData == pending.decodedData &&
                               result.reply.persistenceStatus == "saved";
  bool scanIdCollision = parsed && result.reply.error.indexOf("scanId") >= 0;
  if ((exactAcknowledgement || legacyAcknowledgement) && code >= 200 && code < 300) {
    if (legacyAcknowledgement) printLine("Legacy saved acknowledgement accepted; deploy the scanId-enabled API");
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

void publishUploadUiEvent(UploadUiEventType type, int httpCode, const PendingScan* pending = nullptr, const ServerReply* reply = nullptr) {
  if (uploadUiQueue == nullptr) return;
  UploadUiEvent event = {};
  event.type = type;
  event.httpCode = httpCode;
  event.pending = pendingScanCount;
  event.failed = failedScanCount;
  if (pending != nullptr) copyEventText(event.scanId, sizeof(event.scanId), pending->scanId);
  if (reply != nullptr) {
    copyEventText(event.fullName, sizeof(event.fullName), reply->fullName);
    copyEventText(event.enrollmentNo, sizeof(event.enrollmentNo), reply->enrollmentNo);
    copyEventText(event.entryState, sizeof(event.entryState), reply->entryState);
  }
  xQueueSend(uploadUiQueue, &event, portMAX_DELAY);
}

void processPendingQueueOnce() {
  if (!storageReady || pendingScanCount == 0) return;

  PendingScan pending;
  if (!lockStorage()) {
    publishUploadUiEvent(UPLOAD_UI_STORAGE_ERROR, -1);
    scheduleUploadRetry();
    return;
  }
  bool loaded = loadOldestPendingScan(pending);
  bool countSucceeded = true;
  if (!loaded) {
    size_t currentPending = pendingScanCount;
    countSucceeded = countPendingScans(currentPending);
    if (countSucceeded) pendingScanCount = currentPending;
  }
  unlockStorage();

  if (!loaded) {
    if (!countSucceeded || pendingScanCount > 0) {
      printQueueCounts("read error; retry retained");
      publishUploadUiEvent(UPLOAD_UI_STORAGE_ERROR, -1);
      scheduleUploadRetry();
    }
    return;
  }

  if (WiFi.status() != WL_CONNECTED) {
    WiFi.reconnect();
    printQueueCounts("offline; retry retained");
    publishUploadUiEvent(UPLOAD_UI_RETRY, 0, &pending);
    scheduleUploadRetry();
    return;
  }

  UploadResult result = uploadPendingScan(pending);
  if (result.outcome == UPLOAD_ACKNOWLEDGED) {
    if (!lockStorage()) {
      publishUploadUiEvent(UPLOAD_UI_STORAGE_ERROR, result.httpCode, &pending);
      scheduleUploadRetry();
      return;
    }
    saveCachedProfile(pending.decodedData, result.reply.fullName, result.reply.enrollmentNo);
    bool removed = LittleFS.remove(pending.path);
    if (removed && pendingScanCount > 0) pendingScanCount--;
    unlockStorage();

    if (!removed) {
      printQueueCounts("delete error; retry retained");
      publishUploadUiEvent(UPLOAD_UI_STORAGE_ERROR, result.httpCode, &pending);
      scheduleUploadRetry();
      return;
    }

    uploadRetryMs = INITIAL_RETRY_MS;
    nextUploadAttemptAt = millis() + 100;
    printLine("Durable acknowledgement; removed " + pending.scanId);
    printQueueCounts("after cloud save");
    publishUploadUiEvent(UPLOAD_UI_ACKNOWLEDGED, result.httpCode, &pending, &result.reply);
    return;
  }

  if (result.outcome == UPLOAD_INVALID) {
    if (!lockStorage()) {
      publishUploadUiEvent(UPLOAD_UI_STORAGE_ERROR, result.httpCode, &pending);
      scheduleUploadRetry();
      return;
    }
    bool quarantined = quarantineQueueRecord(pending.path, "HTTP " + String(result.httpCode) + " " + result.reply.error);
    unlockStorage();
    if (!quarantined) {
      publishUploadUiEvent(UPLOAD_UI_STORAGE_ERROR, result.httpCode, &pending);
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
    uploadBlockedHttpCode = result.httpCode;
    uploadProvisioningBlocked = true;
    printLine("Uploads paused until reboot after device provisioning is corrected");
    return;
  }
  scheduleUploadRetry();
}

void uploadWorkerTask(void*) {
  bool idleReported = false;
  bool blockedReported = false;
  while (true) {
    if (!storageReady || pendingScanCount == 0) {
      if (!idleReported) {
        printQueueCounts("drained; uploader idle");
        idleReported = true;
      }
      ulTaskNotifyTake(pdTRUE, portMAX_DELAY);
      uploadRetryMs = INITIAL_RETRY_MS;
      nextUploadAttemptAt = 0;
      continue;
    }
    idleReported = false;

    if (uploadProvisioningBlocked) {
      if (!blockedReported) {
        printQueueCounts("provisioning blocked; uploader paused");
        blockedReported = true;
      }
      ulTaskNotifyTake(pdTRUE, portMAX_DELAY);
      publishUploadUiEvent(UPLOAD_UI_BLOCKED, uploadBlockedHttpCode);
      continue;
    }
    blockedReported = false;

    long waitMs = static_cast<long>(nextUploadAttemptAt - millis());
    if (waitMs > 0) {
      ulTaskNotifyTake(pdTRUE, pdMS_TO_TICKS(min(waitMs, 1000L)));
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
    size_t livePending = pendingScanCount;
    if (event.type == UPLOAD_UI_ACKNOWLEDGED) {
      if (isCurrentScan) {
        if (event.fullName[0] != '\0') lastStudentName = event.fullName;
        if (event.enrollmentNo[0] != '\0') lastEnrollment = event.enrollmentNo;
        if (strcmp(event.entryState, "IN") == 0 || strcmp(event.entryState, "OUT") == 0) lastEntryState = event.entryState;
        displayStatus = lastEntryState.length() ? lastEntryState : "MARKED";
      }
      uploadStatus = livePending == 0 ? "UPLOADED" : "Q:" + String(livePending) + " LEFT";
      drawScreen();
      if (isCurrentScan && !sleepMode) successTone();
    } else if (event.type == UPLOAD_UI_INVALID) {
      if (isCurrentScan) showInvalidQr();
      else {
        uploadStatus = "FAILED SAVED";
        drawScreen();
      }
    } else if (event.type == UPLOAD_UI_BLOCKED) {
      if (event.httpCode == 401 || event.httpCode == 403) uploadStatus = "BAD KEY";
      else if (event.httpCode == 409) uploadStatus = "MAC/ID ERR";
      else uploadStatus = "PAYLOAD ERR";
      drawScreen();
    } else if (event.type == UPLOAD_UI_RETRY) {
      uploadStatus = "Q:" + String(livePending) + (event.httpCode == 0 ? " OFFLINE" : " RETRY");
      drawScreen();
    } else {
      uploadStatus = "QUEUE ERR";
      drawScreen();
    }
  }
}

void setup() {
  auto cfg = M5.config();
  cfg.internal_imu = true;
  M5.begin(cfg);
  Serial.begin(115200);
  M5.Speaker.setVolume(180);

  M5.Display.setRotation(0);
  M5.Display.setBrightness(140);
  initMotionSensor();
  M5.update();
  storageMutex = xSemaphoreCreateMutex();
  uploadUiQueue = xQueueCreate(8, sizeof(UploadUiEvent));
  if (storageMutex != nullptr && uploadUiQueue != nullptr) initializeStorage();
  else printLine("Failed to initialize upload synchronization");
  displayStatus = "BOOT";
  uploadStatus = storageReady ? (pendingScanCount > 0 ? "Q:" + String(pendingScanCount) + " PENDING" : "STARTING") : "FS FAIL";
  drawScreen();
  startupTone();

  printLine("QR Logger ICC boot");
  printLine("Device: " + String(DEVICE_ID));
  printLine("Dashboard: " + String(DASHBOARD_URL));
  connectWiFi();

  while (!qrcode.begin(&Serial1, 115200, UART_TX, UART_RX)) {
    displayStatus = "QR FAIL";
    uploadStatus = "INIT FAIL";
    drawScreen();
    printLine("QRCode init fail");
    failTone();
    delay(1000);
  }

  printLine("QRCode init success");
  qrcode.setTriggerMode(MANUAL_SCAN_MODE);
  displayStatus = "READY";
  uploadStatus = "SCAN QR";
  drawScreen();
  readyTone();

  if (storageReady) {
    BaseType_t taskCreated = xTaskCreatePinnedToCore(uploadWorkerTask, "qr-upload", 16384, nullptr, 1, &uploadTaskHandle, 0);
    if (taskCreated != pdPASS) {
      uploadTaskHandle = nullptr;
      uploadStatus = "TASK FAIL";
      drawScreen();
      printLine("Upload worker creation failed; scans will remain safely queued");
    }
  }
}

void loop() {
  M5.update();
  handleUploadUiEvents();
  bool buttonPressed = M5.BtnA.wasPressed();

  updateMotionSleep(buttonPressed);

  if (sleepMode) {
    drawWifiBadge(WiFi.status() == WL_CONNECTED);
    delay(20);
    return;
  }

  if (millis() - lastScanTriggerAt >= SCAN_TRIGGER_INTERVAL_MS || buttonPressed) {
    lastScanTriggerAt = millis();
    qrcode.setDecodeTrigger(true);
  }

  if (qrcode.available()) {
    String data = qrcode.getDecodeData();
    data.trim();

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
        String cachedName;
        String cachedEnrollment;
        String scanId;
        bool profileCached = false;
        bool persisted = false;
        if (lockStorage()) {
          profileCached = loadCachedProfile(data, cachedName, cachedEnrollment);
          persisted = enqueueScan(data, scanId);
          unlockStorage();
        }
        lastStudentName = profileCached ? cachedName : "";
        lastEnrollment = profileCached ? cachedEnrollment : "";
        lastEntryState = "";
        stableSince = millis();

        if (persisted) {
          lastDecoded = data;
          lastScanId = scanId;
          lastDecodedAt = millis();
          displayStatus = "QUEUED";
          uploadStatus = "Q:" + String(pendingScanCount) + (profileCached ? " CACHED" : " SAVED");
          drawScreen();
          notifyUploadWorker();
        } else {
          displayStatus = storageReady && pendingScanCount >= MAX_PENDING_SCANS ? "Q FULL" : "FS FAIL";
          uploadStatus = "NOT SAVED";
          drawScreen();
          failTone();
        }
      }
    }
  }

  drawWifiBadge(WiFi.status() == WL_CONNECTED);
  delay(10);
}
