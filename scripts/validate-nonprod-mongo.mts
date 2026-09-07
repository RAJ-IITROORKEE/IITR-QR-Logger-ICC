import { randomBytes, randomUUID } from "node:crypto"

import { PrismaClient } from "../.generated/prisma/index.js"

const EXPECTED_HOST = "cluster0.2rsytyn.mongodb.net"
const EXPECTED_DATABASE = "qr-biometric-icc"
const prisma = new PrismaClient()

class RollbackSentinel extends Error {
  constructor() {
    super("validation rollback")
  }
}

function requireCondition(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message)
}

function requireNonProductionTarget() {
  requireCondition(process.env.ALLOW_NONPROD_LEDGER_VALIDATION === "1",
    "Set ALLOW_NONPROD_LEDGER_VALIDATION=1 to run this validation.")
  const value = process.env.DATABASE_URL
  requireCondition(value, "DATABASE_URL is required.")
  const databaseUrl = new URL(value)
  requireCondition(databaseUrl.protocol === "mongodb+srv:", "Expected a mongodb+srv database URL.")
  requireCondition(databaseUrl.hostname === EXPECTED_HOST, "Refusing an unapproved database host.")
  requireCondition(databaseUrl.pathname === `/${EXPECTED_DATABASE}`, "Refusing an unapproved database name.")
}

function isDuplicateKey(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error &&
    (error as { code?: unknown }).code === "P2002"
}

function indexMatches(index: Record<string, unknown>, key: string) {
  const keys = index.key
  return typeof keys === "object" && keys !== null &&
    (keys as Record<string, unknown>)[key] === 1 && index.unique === true
}

async function requireUniqueIndex(collection: string, key: string) {
  const response = await prisma.$runCommandRaw({ listIndexes: collection, cursor: {} })
  const cursor = response.cursor
  const batch = typeof cursor === "object" && cursor !== null
    ? (cursor as { firstBatch?: unknown }).firstBatch
    : undefined
  requireCondition(Array.isArray(batch), `Could not inspect indexes for ${collection}.`)
  requireCondition(batch.some((value) => typeof value === "object" && value !== null &&
    indexMatches(value as Record<string, unknown>, key)),
  `Missing unique ${collection}.${key} index.`)
}

function validationEvent(eventId: string, deduplicationKey: string) {
  return {
    eventId,
    deduplicationKey,
    payloadHash: "validation",
    sourceType: "VALIDATION",
    sourceDeviceId: "VALIDATION",
    intent: "MANUAL_SET_IN",
    occurredAt: new Date(),
    timeQuality: "SERVER",
    status: "APPLIED",
  }
}

async function expectRollback(marker: string) {
  try {
    await prisma.$transaction(async (tx) => {
      await tx.attendanceEvent.create({
        data: validationEvent(`${marker}:rollback`, `${marker}:rollback`),
      })
      throw new RollbackSentinel()
    })
    throw new Error("Rollback transaction unexpectedly committed.")
  } catch (error) {
    if (!(error instanceof RollbackSentinel)) throw error
  }
  const residue = await prisma.attendanceEvent.findUnique({
    where: { eventId: `${marker}:rollback` },
    select: { id: true },
  })
  requireCondition(residue === null, "Rollback transaction left an attendance event.")
}

async function expectEventDuplicate(marker: string, field: "eventId" | "deduplicationKey") {
  try {
    await prisma.$transaction(async (tx) => {
      const eventId = `${marker}:${field}:event`
      const deduplicationKey = `${marker}:${field}:deduplication`
      await tx.attendanceEvent.create({ data: validationEvent(eventId, deduplicationKey) })
      await tx.attendanceEvent.create({
        data: validationEvent(
          field === "eventId" ? eventId : `${eventId}:other`,
          field === "deduplicationKey" ? deduplicationKey : `${deduplicationKey}:other`,
        ),
      })
    })
    throw new Error(`Duplicate ${field} transaction unexpectedly committed.`)
  } catch (error) {
    if (!isDuplicateKey(error)) throw error
  }
}

async function unusedSequence() {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const sequence = BigInt("7000000000000000000") +
      (BigInt(`0x${randomBytes(7).toString("hex")}`) % BigInt("1000000000000000000"))
    const existing = await prisma.attendanceChange.findUnique({
      where: { sequence },
      select: { id: true },
    })
    if (existing === null) return sequence
  }
  throw new Error("Could not allocate an unused validation sequence.")
}

async function expectSequenceDuplicate(marker: string, sequence: bigint) {
  try {
    await prisma.$transaction(async (tx) => {
      await tx.attendanceChange.create({
        data: { sequence, kind: "VALIDATION", snapshot: { marker } },
      })
      await tx.attendanceChange.create({
        data: { sequence, kind: "VALIDATION", snapshot: { marker } },
      })
    })
    throw new Error("Duplicate sequence transaction unexpectedly committed.")
  } catch (error) {
    if (!isDuplicateKey(error)) throw error
  }
}

async function requireNoResidue(marker: string, sequence: bigint) {
  const [events, change] = await Promise.all([
    prisma.attendanceEvent.findMany({
      where: { OR: [{ eventId: { startsWith: marker } }, { deduplicationKey: { startsWith: marker } }] },
      select: { id: true },
    }),
    prisma.attendanceChange.findUnique({ where: { sequence }, select: { id: true } }),
  ])
  requireCondition(events.length === 0 && change === null,
    "Validation left marker records behind; no automatic cleanup was attempted.")
}

async function main() {
  requireNonProductionTarget()
  const marker = `validation:${randomUUID()}`
  const sequence = await unusedSequence()

  await prisma.$runCommandRaw({ ping: 1 })
  await requireUniqueIndex("attendance_events", "eventId")
  await requireUniqueIndex("attendance_events", "deduplicationKey")
  await requireUniqueIndex("attendance_changes", "sequence")
  await expectRollback(marker)
  await expectEventDuplicate(marker, "eventId")
  await expectEventDuplicate(marker, "deduplicationKey")
  await expectSequenceDuplicate(marker, sequence)
  await requireNoResidue(marker, sequence)
  console.log(JSON.stringify({ validation: "passed", checks: ["ping", "indexes", "transactions", "unique-constraints", "rollback-residue"] }))
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : "Validation failed."
  console.error(JSON.stringify({ validation: "failed", error: message }))
  process.exitCode = 1
}).finally(async () => {
  await prisma.$disconnect()
})
