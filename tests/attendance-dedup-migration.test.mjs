import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const MIGRATION_PATH = "./scripts/migrate-attendance-deduplication.mts"
const BACKFILL_PATH = "./scripts/backfill-attendance-ledger.mts"

test("deduplication migration validates collisions and updates bounded batches", () => {
  const source = readFileSync(MIGRATION_PATH, "utf8")
  assert.match(source, /const DEFAULT_BATCH_SIZE = 100/)
  assert.match(source, /\$limit: batchSize/)
  assert.match(source, /assertNoDuplicateKeys/)
  assert.match(source, /deduplicationKey: \{ \$exists: false \}/)
})

test("QR ledger backfill does not own the schema-prerequisite migration", () => {
  const source = readFileSync(BACKFILL_PATH, "utf8")
  assert.equal(source.includes("deduplicationKey: { $exists: false }"), false)
})
