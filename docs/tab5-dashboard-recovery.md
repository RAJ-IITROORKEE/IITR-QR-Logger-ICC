# Tab5 dashboard mirror and recovery

Tab5 uploads are durable `AttendanceEvent` records. Logged Students reads
`QrBiometricReading`, so accepted canonical Tab5 events also need a dashboard
projection. The bridge runs in the attendance transaction and on replay and
reconciliation. Deterministic reading IDs prevent duplicate rows, canonical
reprojection refreshes effective state, and voids/deletion tombstones prevent
recovery from restoring deleted attendance.

After generating the Prisma client, use an environment file containing the
database URL for the deployed project:

```sh
node --env-file=.env.local scripts/recover-tab5-dashboard.mts --dry-run
node --env-file=.env.local scripts/recover-tab5-dashboard.mts
node --env-file=.env.local scripts/recover-tab5-dashboard.mts --dry-run
```

The default limit is 1,000; `--limit=N` accepts up to 10,000. Review dry-run counts
before applying. Recovery copies only eligible existing Tab5 canonical events,
retains their original occurrence times, and prints aggregate counts without
student identifiers or credentials. A repeat run creates no duplicate logs.
Pending identity/time events become eligible through normal reconciliation,
rather than being presented as applied attendance by the recovery script.

Vercel does not export sensitive production variable values through `env pull`.
Keep credential-bearing environment files ignored and use the existing authorized
database configuration for local recovery; do not replace sensitive production
variables with empty downloaded placeholders.
