import { PrismaClient } from "@prisma/client"

const DEFAULT_BATCH_SIZE = 100
const MAX_BATCH_SIZE = 1_000
const prisma = new PrismaClient()

type RawDocument = {
  objectId?: string
  eventId?: string
  sourceDeviceId?: string
  deviceSequence?: string | null
}

type AggregateResult = {
  cursor?: { firstBatch?: unknown[] }
}

function readBatchSize() {
  const argument = process.argv.find((value) => value.startsWith("--batch-size="))
  if (!argument) return DEFAULT_BATCH_SIZE
  const parsed = Number.parseInt(argument.slice("--batch-size=".length), 10)
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > MAX_BATCH_SIZE) {
    throw new Error(`--batch-size must be between 1 and ${MAX_BATCH_SIZE}`)
  }
  return parsed
}

function firstBatch(result: unknown): unknown[] {
  return (result as AggregateResult)?.cursor?.firstBatch ?? []
}

function generatedKeyExpression() {
  return {
    $cond: [
      { $and: [{ $ne: ["$deviceSequence", null] }, { $ne: [{ $type: "$deviceSequence" }, "missing"] }] },
      { $concat: ["manual:", "$sourceDeviceId", ":", "$deviceSequence"] },
      { $concat: ["event:", "$eventId"] },
    ],
  }
}

async function assertNoDuplicateKeys() {
  const result = await prisma.$runCommandRaw({
    aggregate: "attendance_events",
    pipeline: [
      { $project: { key: generatedKeyExpression() } },
      { $group: { _id: "$key", count: { $sum: 1 } } },
      { $match: { count: { $gt: 1 } } },
      { $limit: 1 },
    ],
    cursor: { batchSize: 1 },
  })
  const duplicate = firstBatch(result)[0] as { _id?: string; count?: number } | undefined
  if (duplicate) throw new Error(`Duplicate attendance deduplication key detected: ${duplicate._id ?? "unknown"} (${duplicate.count ?? "?"} records)`)
}

async function readPendingBatch(batchSize: number): Promise<RawDocument[]> {
  const result = await prisma.$runCommandRaw({
    aggregate: "attendance_events",
    pipeline: [
      { $match: { deduplicationKey: { $exists: false } } },
      { $sort: { _id: 1 } },
      { $limit: batchSize },
      { $project: { _id: 0, objectId: { $toString: "$_id" }, eventId: 1, sourceDeviceId: 1, deviceSequence: 1 } },
    ],
    cursor: { batchSize },
  })
  return firstBatch(result) as RawDocument[]
}

function deduplicationKey(document: RawDocument) {
  if (!document.eventId || !document.sourceDeviceId) throw new Error("Attendance event is missing eventId or sourceDeviceId")
  return document.deviceSequence == null
    ? `event:${document.eventId}`
    : `manual:${document.sourceDeviceId}:${document.deviceSequence}`
}

async function main() {
  const batchSize = readBatchSize()
  const dryRun = process.argv.includes("--dry-run")
  await assertNoDuplicateKeys()

  if (dryRun) {
    const pending = await readPendingBatch(batchSize)
    console.log(JSON.stringify({ dryRun: true, batchSize, pendingSampleSize: pending.length }, null, 2))
    return
  }

  let migrated = 0
  for (;;) {
    const pending = await readPendingBatch(batchSize)
    if (pending.length === 0) break
    const updates = pending.map((document) => {
      if (!document.objectId) throw new Error("Attendance event is missing its MongoDB ObjectId")
      return {
        q: { _id: { $oid: document.objectId }, deduplicationKey: { $exists: false } },
        u: { $set: { deduplicationKey: deduplicationKey(document) } },
        multi: false,
      }
    })
    await prisma.$runCommandRaw({ update: "attendance_events", updates, ordered: true })
    migrated += pending.length
    console.log(`Migrated ${migrated} attendance deduplication keys`)
  }

  await assertNoDuplicateKeys()
  console.log(JSON.stringify({ migrated, remaining: (await readPendingBatch(1)).length }, null, 2))
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
}).finally(() => prisma.$disconnect())
