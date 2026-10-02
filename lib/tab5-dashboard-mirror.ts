import { createHash } from "node:crypto"
import type { Prisma } from "@/.generated/prisma"

type DashboardEvent = {
  eventId: string
  sourceType: string
  status: string
  effectiveState: string | null
  studentIdentityId: string | null
  occurredAt: Date
  voidedAt?: Date | null
}

export function tab5DashboardReadingId(eventId: string): string {
  return createHash("sha256").update(`TAB5_MANUAL:${eventId}`).digest("hex").slice(0, 24)
}

/** Project the durable canonical event into the stream read by Logged Students. */
export async function mirrorTab5DashboardEvent(
  tx: Prisma.TransactionClient,
  event: DashboardEvent,
  dryRun = false,
): Promise<"created" | "existing" | "ineligible" | "deleted" | "wouldCreate"> {
  if (event.sourceType !== "TAB5_MANUAL" || event.voidedAt ||
      (event.status !== "APPLIED" && event.status !== "SUPPRESSED_DUPLICATE") ||
      (event.effectiveState !== "IN" && event.effectiveState !== "OUT") ||
      !event.studentIdentityId) return "ineligible"

  const existing = await tx.qrBiometricReading.findFirst({
    where: { attendanceEventId: event.eventId }, select: { id: true, entryState: true },
  })
  if (existing) {
    if (!dryRun && existing.entryState !== event.effectiveState) {
      await tx.qrBiometricReading.updateMany({
        where: { attendanceEventId: event.eventId }, data: { entryState: event.effectiveState },
      })
    }
    return "existing"
  }
  const id = tab5DashboardReadingId(event.eventId)
  if (await tx.qrBiometricDeletion.findUnique({ where: { scanId: id } })) return "deleted"
  const identity = await tx.studentIdentity.findUnique({ where: { id: event.studentIdentityId } })
  if (!identity) return "ineligible"
  if (dryRun) return "wouldCreate"

  const profile = identity.profile && typeof identity.profile === "object" && !Array.isArray(identity.profile)
    ? identity.profile : {}
  // A deterministic Mongo ObjectId also prevents duplicates across concurrent recovery/replay.
  await tx.qrBiometricReading.upsert({
    where: { id }, update: {},
    create: {
      id, deviceId: "MANUAL", decodedData: identity.doswUrl, scanStatus: "success",
      entryState: event.effectiveState, characterCount: identity.doswUrl.length,
      studentInfo: { ...profile, enrollmentNo: identity.enrollmentNo,
        ...(identity.fullName ? { fullName: identity.fullName } : {}) } as Prisma.InputJsonValue,
      studentPhotoUrl: identity.studentPhotoUrl ?? undefined,
      studentInfoStatus: identity.fullName ? "scraped" : "not_applicable",
      enrollmentKey: identity.enrollmentKey, attendanceEventId: event.eventId,
      createdAt: event.occurredAt,
    },
  })
  return "created"
}
