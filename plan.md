# QR-BIOMETRIC-CC Implementation Plan

## Project Objective

Build a production-level QR biometric logger dashboard for ICC, IIT Roorkee. The system will reuse the working QR-code device logic and orange mono-theme from the reference `iot-tracker` QR biometric implementation, while making this repository a dedicated QR biometric attendance/logging product.

## Product Scope

- Public home dashboard for live QR biometric logging.
- Minimal dark orange UI with a simple navbar: About, Support, Admin.
- About page focused on purpose, features, implementation context, and credits without explaining backend logic.
- Support page with enquiry/issue submission.
- Admin dashboard with daily/monthly stats, logs data table, analytics, support inbox, sorting, searching, delete/clear actions, and CSV export.
- MongoDB persistence through Prisma.
- Device-compatible API endpoint for `POST /api/qr-biometric-icc` using the same payload shape as the reference implementation plus a generated device API key.

## Backend Model

- `QrBiometricReading`: stores device id, decoded QR data, IN/OUT entry state, scraped student metadata, status, and timestamp.
- `SupportInquiry`: stores support/enquiry submissions, status, and timestamps.
- `Device`: stores QR biometric device metadata when needed for future expansion.

## API Plan

- `POST /api/qr-biometric-icc`: receive device QR scans, validate the generated API key, validate DOSW StudentProxy QR URLs, resolve IN/OUT state, scrape student profile metadata, persist logs, and return device-friendly JSON.
- `GET /api/qr-biometric-icc`: provide paginated logs, search, sorting, daily/monthly stats, analytics, and health data.
- `DELETE /api/qr-biometric-icc`: delete a single reading or clear scoped readings.
- `GET /api/qr-biometric-icc/export`: export logs as CSV by month or arbitrary date range.
- `POST /api/support`: create support inquiry.
- `GET /api/support`: list support inquiries with search/status filters.
- `PATCH /api/support`: update support inquiry status.
- `DELETE /api/support`: delete support inquiry.

## UI Plan

- Shared public shell with dark mode default and standard orange mono-theme.
- Home page as the dedicated QR biometric dashboard from the reference system, adapted for ICC branding.
- About page with ICC implementation context and credits:
  - Designed and Developed by RAJ RABIDAS, B.Tech 3rd Year, Indian Institute of Technology Roorkee, Department of Metallurgical and Materials Engineering.
  - Mentor/Supervisor: Prof. Rahul Thakur, Department of CSE.
- Support page with clean enquiry form and project support context.
- Admin shell with sidebar links: Dashboard, Logs, Analytics, Support.
- Admin dashboard with stat cards, latest scan, daily/monthly summaries, and compact recent logs.
- Logs page with searchable/sortable table, date/month filters, delete/clear, CSV export.
- Analytics page with operational summaries and device/student trends.
- Support admin page with inbox table, status actions, and delete action.

## Phase Execution

### Phase 0: Planning and Baseline Commit

- Create this `plan.md`.
- Commit only the plan before starting implementation work.

### Phase 1: Public UI Shell and Core Pages

- Update global metadata/theme to QR-BIOMETRIC-CC.
- Add dark orange theme defaults.
- Build public navbar/footer shell.
- Build home dashboard UI using the reference QR biometric dashboard language.
- Build About and Support pages.
- Commit Phase 1.

### Phase 2: Prisma/MongoDB Backend and Device APIs

- Add Prisma and MongoDB configuration.
- Add `.env.example`.
- Add QR biometric, support, and device models.
- Add Prisma client singleton.
- Port/adapt QR biometric utilities and API logic.
- Add support APIs and CSV export API.
- Commit Phase 2.

### Phase 3: Admin Dashboard, Logs, Analytics, Support Inbox

- Add admin layout/sidebar.
- Add admin dashboard stats.
- Add logs data table with search, sorting, date/month filters, delete/clear, and CSV export.
- Add analytics page.
- Add support inbox page with status actions and deletion.
- Commit Phase 3.

### Phase 4: Verification and Final Stabilization

- Run lint/build/type verification available in the project.
- Fix issues discovered during verification.
- Commit verification fixes if required.
- Report final status and any environment requirements.

## Environment Variables

- `DATABASE_URL`: MongoDB connection string for Prisma.
- `NEXT_PUBLIC_APP_URL`: optional absolute app URL for server-side fetch helpers.

## Acceptance Checklist

- Home loads as the QR biometric dashboard.
- Public About and Support pages match requested content and theme.
- Admin navigation exposes Dashboard, Logs, Analytics, Support.
- QR device API accepts working QR biometric payloads.
- Logs persist in MongoDB through Prisma.
- Admin can search, sort, delete, clear, and export logs.
- Support inquiries submit publicly and appear in admin.
- Dark orange mono-theme is consistent across the site.
