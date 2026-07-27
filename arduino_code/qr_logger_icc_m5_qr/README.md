# M5 AtomS3R QR Logger

## Build

Use Arduino ESP32 core 3.3.7 and these board options:

- Board: M5Stack AtomS3
- Flash: 8 MB
- PSRAM: OPI
- Partition scheme: `default_8MB`
- Flash mode: QIO

Required libraries:

- M5Unified 0.2.17
- M5GFX 0.2.22
- M5UnitQRCode 1.0.0
- ArduinoJson 7.4.3

Copy `secrets.h.example` to the ignored `secrets.h` and provision the Wi-Fi and device API credentials there. Rotate credentials before deployment if they have previously been stored in source files.

On a new or fully erased board, hold the AtomS3R button during the first boot to confirm LittleFS formatting. Firmware never automatically formats an unmountable filesystem, preventing a missing NVS marker from erasing recoverable queued scans.

Arduino CLI command:

```powershell
arduino-cli compile --fqbn "esp32:esp32:m5stack_atoms3:PSRAM=opi,PartitionScheme=default_8MB,FlashMode=qio" "arduino_code\qr_logger_icc_m5_qr"
```

## Delivery Guarantees

Each valid scan is written to LittleFS before upload. A dedicated FreeRTOS worker uploads the oldest queued scan without blocking QR polling or the display loop. It retries with the same 24-character `scanId` until the API returns an authenticated acknowledgement containing the same ID and `persistence.status: "saved"`. During legacy API rollout, a response with no `scanId` is accepted only when trusted HTTPS returns 2xx JSON containing `success: true` and `persistence.status: "saved"`. Acknowledged records are immediately removed.

Legacy acknowledgement compatibility is controlled by `ALLOW_LEGACY_SAVED_ACK` in the sketch and additionally requires the echoed device ID and decoded data to match the queued request. Set it to `false` after every deployed API echoes `scanId`.

The serial monitor reports both stores as `pending=<count> failed=<count>` after persistence, retry, quarantine, and cloud acknowledgement. At `pending=0`, the worker blocks until a new scan notification and performs no polling or HTTP retries. HTTP 400/401/403/409 provisioning failures pause the uploader until reboot so a bad key or MAC lock cannot generate repeated traffic; correct provisioning before rebooting. The `failed` count contains quarantined permanent payload errors and is not retried automatically.

Malformed records and permanent payload rejections are moved to `/failed` instead of being deleted. The display reports active and failed counts as `Q:<count> F:<count>`. Failed retention is capped at 32 records and 64 KB; once full, the queue head is retained and uploads pause rather than deleting evidence. Provisioning failures remain queued because they generally affect every subsequent record.

Queue writes use a flushed temporary file followed by an atomic rename. On boot, a complete temporary queue record left by a power loss is validated and recovered instead of being discarded.

Known student profiles are cached locally. A first scan of an unseen QR displays its decoded URL until the API response supplies the name and enrollment because those fields are not encoded in the opaque DOSW URL. The cache is capped at 64 profiles and reserves 128 KB for the scan queue.

HTTPS validates the server against ISRG Root X1 and requires an NTP-synchronized clock. Before flashing production devices, verify that `iitrlogger.com` still serves a certificate chain rooted at ISRG Root X1. Update the embedded trust anchor if the deployment provider changes its chain.
