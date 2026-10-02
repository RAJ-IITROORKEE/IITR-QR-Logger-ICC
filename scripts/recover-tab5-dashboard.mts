import { PrismaClient } from "../.generated/prisma/index.js"
import { mirrorTab5DashboardEvent } from "../lib/tab5-dashboard-mirror.ts"

const prisma = new PrismaClient()
const dryRun = process.argv.includes("--dry-run")
const limitArgument = process.argv.find((value) => value.startsWith("--limit="))
const limit = limitArgument ? Number(limitArgument.slice(8)) : 1000
if (!Number.isSafeInteger(limit) || limit < 1 || limit > 10000) throw new Error("--limit must be 1..10000")

async function main() {
  // Pending, rejected, deleted, and non-Tab5 events are never manufactured into logs.
  const events = await prisma.attendanceEvent.findMany({
    where: { sourceType: "TAB5_MANUAL", status: { in: ["APPLIED", "SUPPRESSED_DUPLICATE"] },
      effectiveState: { in: ["IN", "OUT"] }, studentIdentityId: { not: null } },
    orderBy: [{ occurredAt: "asc" }, { eventId: "asc" }], take: limit,
  })
  const counts = { dryRun, scanned: events.length, created: 0, existing: 0,
    ineligible: 0, deleted: 0, wouldCreate: 0 }
  for (const event of events) {
    let lastError: unknown
    for (let attempt = 0; attempt < 3; ++attempt) {
      try {
        const result = await prisma.$transaction(async (tx) => {
          // Re-read inside the transaction to respect concurrent void/reconciliation.
          const current = await tx.attendanceEvent.findUnique({ where: { eventId: event.eventId } })
          return current ? mirrorTab5DashboardEvent(tx, current, dryRun) : "ineligible"
        }, { maxWait: 5000, timeout: 15000 })
        counts[result]++
        lastError = undefined
        break
      } catch (error) {
        lastError = error
        const code = error && typeof error === "object" && "code" in error ? String(error.code) : ""
        if (code !== "P2034" || attempt === 2) throw error
        await new Promise((resolve) => setTimeout(resolve, 25 * 2 ** attempt))
      }
    }
    if (lastError) throw lastError
  }
  // Only aggregate counts are printed; no enrollment numbers, names, or credentials.
  console.log(JSON.stringify(counts))
}

main().catch((error: unknown) => {
  const rawCode = error && typeof error === "object" && "errorCode" in error ? String(error.errorCode)
    : error && typeof error === "object" && "code" in error ? String(error.code) : "UNKNOWN"
  const code = /^P\d{4}$/.test(rawCode) ? rawCode : "UNKNOWN"
  console.error("Tab5 dashboard recovery failed", { code })
  process.exitCode = 1
}).finally(async () => prisma.$disconnect())
