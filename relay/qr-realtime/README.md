# QR Realtime Relay

Cloud Run WebSocket accelerator for QR attendance. MongoDB and the existing HTTPS API remain authoritative.

## Guarantees

- Scanner credentials are sent only in the first encrypted WebSocket message, never in a URL.
- A `scan.ack` is emitted only after the upstream API returns the same `scanId` with `persistence.status: "saved"`.
- Scanner HTTPS fallback reuses the same idempotent `scanId`.
- Dashboard notifications contain no student profile data and trigger an authenticated HTTPS refresh.
- The deployment is limited to one Cloud Run instance because fan-out is process-local. Dashboard polling self-heals during restarts.

## Runtime

- `UPSTREAM_BASE_URL`: authoritative HTTPS application origin.
- `RELAY_TOKEN_SECRET`: at least 32 bytes, supplied from Secret Manager.
- `RELAY_PUBLISH_SECRET`: at least 32 bytes, used only by the authoritative application for post-commit hints.
- `PORT`: injected by Cloud Run.

Endpoints:

- `GET /health`
- `GET /metrics`
- `WSS /v1/realtime`
- `POST /v1/publish` (application-secret authenticated; metadata only)

Run locally with `npm install`, `npm test`, then `npm start` with the required environment variables.
