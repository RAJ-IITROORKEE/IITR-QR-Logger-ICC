import assert from "node:assert/strict"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { spawnSync } from "node:child_process"
import test from "node:test"

test("backfill keeps the valid database URL when Vercel local env contains an empty value", () => {
  const directory = mkdtempSync(join(tmpdir(), "qr-photo-backfill-env-"))
  try {
    writeFileSync(join(directory, ".env.local"), "DATABASE_URL=\nBLOB_READ_WRITE_TOKEN=local-blob-token\n")
    writeFileSync(join(directory, ".env"), "DATABASE_URL=mongodb://valid-database\n")

    const packageJson = JSON.parse(readFileSync("./package.json", "utf8"))
    const envFlags = packageJson.scripts["photos:backfill"].match(/--env-file-if-exists=\S+/g) ?? []
    const result = spawnSync(process.execPath, [
      ...envFlags,
      "-e",
      "process.stdout.write(JSON.stringify({ database: process.env.DATABASE_URL, blob: process.env.BLOB_READ_WRITE_TOKEN }))",
    ], { cwd: directory, encoding: "utf8" })

    assert.equal(result.status, 0, result.stderr)
    assert.deepEqual(JSON.parse(result.stdout), {
      database: "mongodb://valid-database",
      blob: "local-blob-token",
    })
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
