import { createHash, randomUUID } from "node:crypto"
import type { Prisma } from "@prisma/client"

import {
  attendanceEventDeduplicationKey,
  chunkAttendanceReadingIds,
  hashManualAttendancePayload,
  normalizeEnrollmentKey,
  rebuildAttendanceProjection,
  type AttendanceEntryState,
  type AttendanceIntent,
  type AttendanceTimeQuality,
  type ManualAttendanceBatch,
} from "./attendance-device-contract.ts"
import { hashFingerprintEventPayload, type FingerprintAttendanceBatch } from "./fingerprint-device-contract.ts"
import type { AuthenticatedAttendanceDevice } from "./attendance-device-auth.ts"
import { isStoredStudentPhotoUrl } from "./qr-biometric-photo.ts"
import { isDoswStudentUrl, normalizeDecodedUrl } from "./qr-biometric-student.ts"
import { prisma } from "./prisma.ts"
import type { QrStudentInfo } from "../types/qr-biometric.ts"

type Transaction = Prisma.TransactionClient
let lastReconciliationAt = 0

type AttendanceIdentity = {
  id: string
  enrollmentKey: string
  enrollmentNo: string
  doswUrl: string
  fullName: string | null
  profile: Prisma.JsonValue | null
  studentPhotoUrl: string | null
  photoVersion: number
}

export type ManualAttendanceResult = {
  eventId: string
  status: string
  effectiveState: AttendanceEntryState | null
  replayed: boolean
}

export type FingerprintAttendanceResult = {
  eventId: string
  status: string
  effectiveState: AttendanceEntryState | null
  replayed: boolean
}

export type CanonicalQrAttendanceInput = {
  readingId: string
  sourceDeviceId: string
  decodedData: string
  occurredAt: Date
  studentInfo: QrStudentInfo
  studentPhotoUrl: string | null
}

export type CanonicalAttendanceOptions = {
  eventId?: string
  sourceType?: "QR" | "LEGACY"
  intent?: AttendanceIntent
  emitChange?: boolean
}

export class AttendanceEventConflictError extends Error {
  constructor(message = "eventId or deviceSequence is already assigned to different attendance data") {
    super(message)
    this.name = "AttendanceEventConflictError"
  }
}

function isRetryableTransactionError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false
  const code = "code" in error ? String(error.code) : ""
  const message = error instanceof Error ? error.message.toLowerCase() : ""
  return code === "P2034" || message.includes("write conflict") || message.includes("transienttransactionerror")
}

async function runTransactionWithRetry<T>(operation: (tx: Transaction) => Promise<T>): Promise<T> {
  let lastError: unknown
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await prisma.$transaction(operation, { maxWait: 5_000, timeout: 15_000 })
    } catch (error) {
      lastError = error
      if (!isRetryableTransactionError(error) || attempt === 2) throw error
      await new Promise((resolve) => setTimeout(resolve, 25 * 2 ** attempt))
    }
  }
  throw lastError
}

function asInputJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue
}

async function emitAttendanceChange(
  tx: Transaction,
  kind: string,
  snapshot: Prisma.InputJsonValue,
  attendanceEventId: string | null,
  audienceDeviceId: string | null = null,
) {
  const counter = await tx.attendanceFeedCounter.upsert({
    where: { id: "attendance" },
    create: { id: "attendance", value: BigInt(1) },
    update: { value: { increment: BigInt(1) } },
  })
  return tx.attendanceChange.create({
    data: { sequence: counter.value, kind, snapshot, attendanceEventId, audienceDeviceId },
  })
}

function isAttendanceIntent(value: string): value is AttendanceIntent {
  return value === "QR_TOGGLE" || value === "FINGERPRINT_TOGGLE" || value === "MANUAL_SET_IN" || value === "MANUAL_SET_OUT"
}

export class FingerprintEnrollmentConflictError extends Error {
  constructor(message = "fingerprint slot is already assigned to another enrollment") {
    super(message)
    this.name = "FingerprintEnrollmentConflictError"
  }
}

function isAttendanceTimeQuality(value: string): value is AttendanceTimeQuality {
  return value === "SERVER" || value === "SYNCED_RTC" || value === "UNTRUSTED"
}

async function rebuildStudentProjection(tx: Transaction, identity: AttendanceIdentity, emitGlobalChange = true) {
  const storedEvents = await tx.attendanceEvent.findMany({
    where: {
      enrollmentKey: identity.enrollmentKey,
      studentIdentityId: identity.id,
      status: { notIn: ["IDENTITY_CONFLICT", "REJECTED", "VOIDED"] },
    },
  })
  const eligibleEvents = storedEvents.filter((event) => !event.voidedAt && isAttendanceIntent(event.intent) && isAttendanceTimeQuality(event.timeQuality))
  const rebuilt = rebuildAttendanceProjection(eligibleEvents.map((event) => ({
    eventId: event.eventId,
    intent: event.intent as AttendanceIntent,
    occurredAt: event.occurredAt,
    sourceDeviceId: event.sourceDeviceId,
    deviceSequence: event.deviceSequence,
    timeQuality: event.timeQuality as AttendanceTimeQuality,
  })))
  const previousProjection = await tx.attendanceProjection.findUnique({ where: { enrollmentKey: identity.enrollmentKey } })
  const projectionVersion = (previousProjection?.version ?? 0) + 1
  const storedByEventId = new Map(storedEvents.map((event) => [event.eventId, event]))
  const readingIdsByState: Record<AttendanceEntryState, string[]> = { IN: [], OUT: [] }

  for (const event of rebuilt.events) {
    const storedEvent = storedByEventId.get(event.eventId)
    if (storedEvent?.status !== event.status || storedEvent.effectiveState !== event.effectiveState) {
      await tx.attendanceEvent.update({
        where: { eventId: event.eventId },
        data: {
          status: event.status,
          effectiveState: event.effectiveState,
          projectionVersion,
        },
      })
    }
    const readingId = event.eventId.startsWith("qr:")
      ? event.eventId.slice(3)
      : event.eventId.startsWith("legacy:") ? event.eventId.slice(7) : null
    if (readingId && event.effectiveState) readingIdsByState[event.effectiveState].push(readingId)
  }
  for (const entryState of ["IN", "OUT"] as const) {
    if (readingIdsByState[entryState].length === 0) continue
    await tx.qrBiometricReading.updateMany({
      where: { id: { in: readingIdsByState[entryState] }, entryState: { not: entryState } },
      data: { entryState },
    })
  }

  await tx.attendanceProjection.upsert({
    where: { enrollmentKey: identity.enrollmentKey },
    create: {
      enrollmentKey: identity.enrollmentKey,
      studentIdentityId: identity.id,
      currentState: rebuilt.currentState,
      latestEffectiveEventId: rebuilt.latestEffectiveEventId,
      latestOccurredAt: rebuilt.latestOccurredAt,
      version: projectionVersion,
    },
    update: {
      studentIdentityId: identity.id,
      currentState: rebuilt.currentState,
      latestEffectiveEventId: rebuilt.latestEffectiveEventId,
      latestOccurredAt: rebuilt.latestOccurredAt,
      version: projectionVersion,
    },
  })

  if (emitGlobalChange && rebuilt.latestEffectiveEventId) {
    const latestStored = storedEvents.find((event) => event.eventId === rebuilt.latestEffectiveEventId)
    if (latestStored) {
      await emitAttendanceChange(tx, "LATEST_SNAPSHOT", asInputJson({
        event: {
          eventId: latestStored.eventId,
          occurredAt: latestStored.occurredAt.toISOString(),
          entryState: rebuilt.currentState,
          sourceType: latestStored.sourceType,
          status: "APPLIED",
        },
        student: {
          identityId: identity.id,
          name: identity.fullName,
          enrollment: identity.enrollmentNo,
          photoVersion: identity.photoVersion,
          photoPath: identity.studentPhotoUrl ? `/api/device/v1/photos/${identity.id}?v=${identity.photoVersion}` : null,
        },
        projectionVersion,
      }), latestStored.eventId)
    }
  }

  return { ...rebuilt, projectionVersion }
}

export async function recordManualAttendanceBatch(device: AuthenticatedAttendanceDevice, batch: ManualAttendanceBatch): Promise<ManualAttendanceResult[]> {
  return runTransactionWithRetry(async (tx) => {
    const outcomes = new Map<string, ManualAttendanceResult>()
    const newEventIds = new Set<string>()
    const identities = new Map<string, AttendanceIdentity>()
    const touchedEnrollments = new Set<string>()
    const now = new Date()

    for (const event of batch.events) {
      const payloadHash = hashManualAttendancePayload(device.deviceId, batch.bootId, event)
      const deduplicationKey = attendanceEventDeduplicationKey(device.deviceId, event.deviceSequence, event.eventId)
      const existing = await tx.attendanceEvent.findUnique({ where: { eventId: event.eventId } })
      if (existing) {
        if (existing.sourceDeviceId !== device.deviceId || existing.payloadHash !== payloadHash) throw new AttendanceEventConflictError()
        outcomes.set(event.eventId, {
          eventId: event.eventId,
          status: existing.status,
          effectiveState: existing.effectiveState as AttendanceEntryState | null,
          replayed: true,
        })
        continue
      }

      const sequenceCollision = await tx.attendanceEvent.findUnique({
        where: { deduplicationKey },
        select: { eventId: true },
      })
      if (sequenceCollision) throw new AttendanceEventConflictError("deviceSequence is already assigned to another event")

      let identity = identities.get(event.enrollmentKey)
      if (identity === undefined) {
        identity = await tx.studentIdentity.findUnique({ where: { enrollmentKey: event.enrollmentKey } }) ?? undefined
        if (identity) identities.set(event.enrollmentKey, identity)
      }
      const futureTimestamp = event.occurredAt.getTime() > now.getTime() + 5 * 60_000
      const timeQuality = futureTimestamp ? "UNTRUSTED" : event.timeQuality
      const status = !identity ? "PENDING_IDENTITY" : timeQuality === "UNTRUSTED" ? "PENDING_TIME" : "APPLIED"

      await tx.attendanceEvent.create({
        data: {
          eventId: event.eventId,
          deduplicationKey,
          payloadHash,
          sourceType: "TAB5_MANUAL",
          sourceDeviceId: device.deviceId,
          deviceSequence: event.deviceSequence,
          bootId: batch.bootId,
          intent: event.intent,
          enrollmentKey: event.enrollmentKey,
          studentIdentityId: identity?.id,
          occurredAt: event.occurredAt,
          timeQuality,
          status,
        },
      })
      newEventIds.add(event.eventId)
      if (identity) touchedEnrollments.add(event.enrollmentKey)
      outcomes.set(event.eventId, { eventId: event.eventId, status, effectiveState: null, replayed: false })
    }

    for (const enrollmentKey of touchedEnrollments) {
      const identity = identities.get(enrollmentKey)
      if (!identity) continue
      const rebuilt = await rebuildStudentProjection(tx, identity)
      for (const result of rebuilt.events) {
        const outcome = outcomes.get(result.eventId)
        if (outcome) {
          outcome.status = result.status
          outcome.effectiveState = result.effectiveState
        }
      }
    }

    for (const eventId of newEventIds) {
      const outcome = outcomes.get(eventId)!
      await emitAttendanceChange(tx, "EVENT_STATUS", asInputJson(outcome), eventId, device.deviceId)
    }

    return batch.events.map((event) => outcomes.get(event.eventId)!)
  })
}

export async function recordFingerprintAttendanceBatch(device: AuthenticatedAttendanceDevice, batch: FingerprintAttendanceBatch): Promise<FingerprintAttendanceResult[]> {
  return runTransactionWithRetry(async (tx) => {
    const outcomes = new Map<string, FingerprintAttendanceResult>()
    const newEventIds = new Set<string>()
    const identities = new Map<string, AttendanceIdentity>()
    const touchedEnrollments = new Set<string>()
    const now = new Date()

    for (const event of batch.events) {
      const payloadHash = hashFingerprintEventPayload(device.deviceId, batch.bootId, event)
      const deduplicationKey = attendanceEventDeduplicationKey(device.deviceId, event.deviceSequence, event.eventId)
      const existing = await tx.attendanceEvent.findUnique({ where: { eventId: event.eventId } })
      if (existing) {
        if (existing.sourceDeviceId !== device.deviceId || existing.payloadHash !== payloadHash) throw new AttendanceEventConflictError()
        outcomes.set(event.eventId, {
          eventId: event.eventId,
          status: existing.status,
          effectiveState: existing.effectiveState as AttendanceEntryState | null,
          replayed: true,
        })
        continue
      }

      const sequenceCollision = await tx.attendanceEvent.findUnique({
        where: { deduplicationKey },
        select: { eventId: true },
      })
      if (sequenceCollision) throw new AttendanceEventConflictError("deviceSequence is already assigned to another event")

      const enrollment = await tx.fingerprintEnrollment.findFirst({
        where: { deviceId: device.deviceId, fingerprintSlot: event.fingerprintSlot, state: "ACTIVE", enabled: true },
      })
      const slotMatchesIndex = !enrollment || enrollment.fingerprintIndex === null || event.fingerprintIndex === null || enrollment.fingerprintIndex === event.fingerprintIndex
      const mappedEnrollment = slotMatchesIndex ? enrollment : null
      let identity: AttendanceIdentity | null = null
      if (mappedEnrollment) {
        identity = await tx.studentIdentity.findUnique({ where: { enrollmentKey: mappedEnrollment.enrollmentKey } })
        if (identity) identities.set(mappedEnrollment.enrollmentKey, identity)
      }

      const futureTimestamp = event.occurredAt.getTime() > now.getTime() + 5 * 60_000
      const timeQuality = futureTimestamp ? "UNTRUSTED" : event.timeQuality
      const status = !mappedEnrollment
        ? "PENDING_FINGERPRINT_MAPPING"
        : !identity
          ? "PENDING_IDENTITY"
          : timeQuality === "UNTRUSTED" ? "PENDING_TIME" : "APPLIED"

      await tx.attendanceEvent.create({
        data: {
          eventId: event.eventId,
          deduplicationKey,
          payloadHash,
          sourceType: "FINGERPRINT",
          sourceDeviceId: device.deviceId,
          deviceSequence: event.deviceSequence,
          bootId: batch.bootId,
          intent: event.intent,
          enrollmentKey: mappedEnrollment?.enrollmentKey,
          studentIdentityId: identity?.id,
          fingerprintSlot: event.fingerprintSlot,
          fingerprintIndex: event.fingerprintIndex,
          occurredAt: event.occurredAt,
          timeQuality,
          status,
        },
      })
      newEventIds.add(event.eventId)
      if (identity) touchedEnrollments.add(identity.enrollmentKey)
      outcomes.set(event.eventId, { eventId: event.eventId, status, effectiveState: null, replayed: false })
    }

    for (const enrollmentKey of touchedEnrollments) {
      const identity = identities.get(enrollmentKey)
      if (!identity) continue
      const rebuilt = await rebuildStudentProjection(tx, identity)
      for (const result of rebuilt.events) {
        const outcome = outcomes.get(result.eventId)
        if (outcome) {
          outcome.status = result.status
          outcome.effectiveState = result.effectiveState
        }
      }
    }

    for (const eventId of newEventIds) {
      const outcome = outcomes.get(eventId)!
      await emitAttendanceChange(tx, "EVENT_STATUS", asInputJson(outcome), eventId, device.deviceId)
    }

    return batch.events.map((event) => outcomes.get(event.eventId)!)
  })
}

export type CreateFingerprintEnrollmentInput = {
  deviceId: string
  enrollmentKey: string
  fingerprintSlot: number
  fingerprintIndex: number | null
}

export async function createFingerprintEnrollment(input: CreateFingerprintEnrollmentInput) {
  return runTransactionWithRetry(async (tx) => {
    const identity = await tx.studentIdentity.findUnique({ where: { enrollmentKey: input.enrollmentKey } })
    if (!identity) throw new FingerprintEnrollmentConflictError("student identity was not found")
    const existing = await tx.fingerprintEnrollment.findFirst({
      where: { deviceId: input.deviceId, fingerprintSlot: input.fingerprintSlot },
    })
    if (existing) throw new FingerprintEnrollmentConflictError()

    const enrollment = await tx.fingerprintEnrollment.create({
      data: { ...input, state: "ENROLL_PENDING", enabled: false },
    })
    const command = await tx.fingerprintCommand.create({
      data: {
        commandId: `fp:${randomUUID()}`,
        deviceId: input.deviceId,
        commandType: "ENROLL",
        enrollmentKey: input.enrollmentKey,
        fingerprintSlot: input.fingerprintSlot,
        fingerprintIndex: input.fingerprintIndex,
        payload: {},
      },
    })
    return { enrollment, command }
  })
}

function canonicalQrPayloadHash(input: CanonicalQrAttendanceInput, enrollmentKey: string, eventId: string, sourceType: string, intent: AttendanceIntent): string {
  return createHash("sha256").update(JSON.stringify({
    eventId,
    sourceType,
    intent,
    sourceDeviceId: input.sourceDeviceId,
    decodedData: input.decodedData,
    enrollmentKey,
    occurredAt: input.occurredAt.toISOString(),
  })).digest("hex")
}

export async function recordCanonicalQrAttendance(input: CanonicalQrAttendanceInput, options: CanonicalAttendanceOptions = {}) {
  const enrollmentKey = normalizeEnrollmentKey(input.studentInfo.enrollmentNo)
  const doswUrl = normalizeDecodedUrl(input.decodedData)
  if (!enrollmentKey || !doswUrl || !isDoswStudentUrl(doswUrl)) return { status: "PENDING_PROFILE" as const, effectiveState: null }

  const eventId = options.eventId ?? `qr:${input.readingId}`
  const sourceType = options.sourceType ?? "QR"
  const intent = options.intent ?? "QR_TOGGLE"
  const deduplicationKey = attendanceEventDeduplicationKey(input.sourceDeviceId, null, eventId)
  const payloadHash = canonicalQrPayloadHash(input, enrollmentKey, eventId, sourceType, intent)
  return runTransactionWithRetry(async (tx) => {
    const [rawReading, deletion] = await Promise.all([
      tx.qrBiometricReading.findUnique({ where: { id: input.readingId }, select: { id: true } }),
      tx.qrBiometricDeletion.findUnique({ where: { scanId: input.readingId }, select: { id: true } }),
    ])
    if (!rawReading || deletion) throw new AttendanceEventConflictError("Attendance reading was deleted before canonical processing")
    const existingEvent = await tx.attendanceEvent.findUnique({ where: { eventId } })
    if (existingEvent) {
      if (existingEvent.payloadHash !== payloadHash || existingEvent.sourceDeviceId !== input.sourceDeviceId) throw new AttendanceEventConflictError()
      await tx.qrBiometricReading.updateMany({ where: { id: input.readingId }, data: { enrollmentKey, attendanceEventId: eventId } })
      return { status: existingEvent.status, effectiveState: existingEvent.effectiveState as AttendanceEntryState | null }
    }

    const [byEnrollment, byDoswUrl] = await Promise.all([
      tx.studentIdentity.findUnique({ where: { enrollmentKey } }),
      tx.studentIdentity.findUnique({ where: { doswUrl } }),
    ])
    const identityConflict = Boolean(
      (byEnrollment && byEnrollment.doswUrl !== doswUrl)
      || (byDoswUrl && byDoswUrl.enrollmentKey !== enrollmentKey)
      || (byEnrollment && byDoswUrl && byEnrollment.id !== byDoswUrl.id),
    )
    if (identityConflict) {
      await tx.attendanceEvent.create({
        data: {
          eventId,
          deduplicationKey,
          payloadHash,
          sourceType,
          sourceDeviceId: input.sourceDeviceId,
          intent,
          enrollmentKey,
          doswUrl,
          occurredAt: input.occurredAt,
          timeQuality: "SERVER",
          status: "IDENTITY_CONFLICT",
        },
      })
      await tx.qrBiometricReading.update({ where: { id: input.readingId }, data: { enrollmentKey, attendanceEventId: eventId } })
      return { status: "IDENTITY_CONFLICT" as const, effectiveState: null }
    }

    const storedPhotoUrl = isStoredStudentPhotoUrl(input.studentPhotoUrl) ? input.studentPhotoUrl : null
    const profile = asInputJson(input.studentInfo)
    const identity = byEnrollment ?? byDoswUrl ?? await tx.studentIdentity.create({
      data: {
        enrollmentKey,
        enrollmentNo: input.studentInfo.enrollmentNo!.trim(),
        doswUrl,
        fullName: input.studentInfo.fullName?.trim() || null,
        profile,
        studentPhotoUrl: storedPhotoUrl,
      },
    })
    const updatedIdentity = await tx.studentIdentity.update({
      where: { id: identity.id },
      data: {
        enrollmentNo: input.studentInfo.enrollmentNo!.trim(),
        fullName: input.studentInfo.fullName?.trim() || identity.fullName,
        profile,
        studentPhotoUrl: storedPhotoUrl ?? identity.studentPhotoUrl,
        photoVersion: storedPhotoUrl && storedPhotoUrl !== identity.studentPhotoUrl ? { increment: 1 } : undefined,
        lastSeenAt: new Date(),
      },
    })

    await tx.attendanceEvent.updateMany({
      where: { enrollmentKey, status: "PENDING_IDENTITY" },
      data: { studentIdentityId: updatedIdentity.id, status: "APPLIED" },
    })
    await tx.attendanceEvent.create({
      data: {
        eventId,
        deduplicationKey,
        payloadHash,
        sourceType,
        sourceDeviceId: input.sourceDeviceId,
        intent,
        enrollmentKey,
        studentIdentityId: updatedIdentity.id,
        doswUrl,
        occurredAt: input.occurredAt,
        timeQuality: "SERVER",
        status: "APPLIED",
      },
    })
    const rebuilt = await rebuildStudentProjection(tx, updatedIdentity, options.emitChange ?? true)
    const eventResult = rebuilt.events.find((event) => event.eventId === eventId)
    await tx.qrBiometricReading.updateMany({
      where: { id: input.readingId },
      data: { enrollmentKey, attendanceEventId: eventId },
    })
    return { status: eventResult?.status ?? "APPLIED", effectiveState: eventResult?.effectiveState ?? null }
  })
}

async function voidCanonicalAttendanceForReadingsInTransaction(tx: Transaction, readingIds: string[], reason: string) {
  const eventIds = readingIds.flatMap((id) => [`qr:${id}`, `legacy:${id}`])
  const events = await tx.attendanceEvent.findMany({
    where: { eventId: { in: eventIds }, status: { not: "VOIDED" } },
    select: { eventId: true, studentIdentityId: true },
  })
  if (events.length > 0) {
    await tx.attendanceEvent.updateMany({
      where: { eventId: { in: events.map((event) => event.eventId) } },
      data: { status: "VOIDED", effectiveState: null, voidedAt: new Date(), voidReason: reason },
    })
    const identityIds = [...new Set(events.map((event) => event.studentIdentityId).filter((id): id is string => Boolean(id)))]
    for (const identityId of identityIds) {
      const identity = await tx.studentIdentity.findUnique({ where: { id: identityId } })
      if (!identity) continue
      const rebuilt = await rebuildStudentProjection(tx, identity, true)
      if (!rebuilt.latestEffectiveEventId) {
        await emitAttendanceChange(tx, "PROJECTION_CORRECTED", asInputJson({
          event: null,
          student: {
            identityId: identity.id,
            name: identity.fullName,
            enrollment: identity.enrollmentNo,
            photoVersion: identity.photoVersion,
            photoPath: identity.studentPhotoUrl ? `/api/device/v1/photos/${identity.id}?v=${identity.photoVersion}` : null,
          },
          entryState: "OUT",
          projectionVersion: rebuilt.projectionVersion,
        }), null)
      }
    }
  }
  return events.length
}

export async function deleteCanonicalAttendanceReadings(readingIds: string[], reason: string) {
  if (readingIds.length === 0) return { deletedReadings: 0, voidedEvents: 0 }
  let deletedReadings = 0
  let voidedEvents = 0
  for (const batch of chunkAttendanceReadingIds(readingIds)) {
    const result = await runTransactionWithRetry(async (tx) => {
      const readings = await tx.qrBiometricReading.findMany({
        where: { id: { in: batch } },
        select: { id: true, deviceId: true, decodedData: true },
      })
      for (const reading of readings) {
        await tx.qrBiometricDeletion.upsert({
          where: { scanId: reading.id },
          create: { scanId: reading.id, deviceId: reading.deviceId, decodedData: reading.decodedData },
          update: {},
        })
      }
      const voided = await voidCanonicalAttendanceForReadingsInTransaction(tx, readings.map((reading) => reading.id), reason)
      const deleted = await tx.qrBiometricReading.deleteMany({ where: { id: { in: readings.map((reading) => reading.id) } } })
      return { deletedReadings: deleted.count, voidedEvents: voided }
    })
    deletedReadings += result.deletedReadings
    voidedEvents += result.voidedEvents
  }
  return { deletedReadings, voidedEvents }
}

export async function reconcilePendingCanonicalReadings(limit = 10) {
  const now = Date.now()
  if (now - lastReconciliationAt < 60_000) return 0
  lastReconciliationAt = now
  const readings = await prisma.qrBiometricReading.findMany({
    where: {
      OR: [
        { attendanceEventId: null },
        { attendanceEventId: { isSet: false } },
      ],
    },
    orderBy: { createdAt: "asc" },
    take: 5_000,
  })
  let reconciled = 0
  for (const reading of readings) {
    if (reconciled >= Math.max(1, Math.min(limit, 50))) break
    const studentInfo = reading.studentInfo as QrStudentInfo | null
    if (!studentInfo?.enrollmentNo) continue
    const sourceType = reading.deviceId === "MANUAL" ? "LEGACY" : "QR"
    const intent: AttendanceIntent = sourceType === "LEGACY"
      ? reading.entryState === "IN" ? "MANUAL_SET_IN" : "MANUAL_SET_OUT"
      : "QR_TOGGLE"
    try {
      const result = await recordCanonicalQrAttendance({
        readingId: reading.id,
        sourceDeviceId: reading.deviceId,
        decodedData: reading.decodedData,
        occurredAt: reading.createdAt,
        studentInfo,
        studentPhotoUrl: reading.studentPhotoUrl,
      }, {
        eventId: sourceType === "LEGACY" ? `legacy:${reading.id}` : `qr:${reading.id}`,
        sourceType,
        intent,
      })
      if (result.status !== "PENDING_PROFILE") reconciled++
    } catch (error) {
      console.error("[attendance-ledger] Pending reading reconciliation failed", reading.id, error)
    }
  }
  return reconciled
}

export async function publishLatestAttendanceSnapshot() {
  return runTransactionWithRetry(async (tx) => {
    const projection = await tx.attendanceProjection.findFirst({
      orderBy: { latestOccurredAt: "desc" },
    })
    if (!projection?.latestEffectiveEventId || !projection.studentIdentityId) return false
    const [identity, event] = await Promise.all([
      tx.studentIdentity.findUnique({ where: { id: projection.studentIdentityId } }),
      tx.attendanceEvent.findUnique({ where: { eventId: projection.latestEffectiveEventId } }),
    ])
    if (!identity || !event) return false
    await emitAttendanceChange(tx, "LATEST_SNAPSHOT", asInputJson({
      event: {
        eventId: event.eventId,
        occurredAt: event.occurredAt.toISOString(),
        entryState: projection.currentState,
        sourceType: event.sourceType,
        status: event.status,
      },
      student: {
        identityId: identity.id,
        name: identity.fullName,
        enrollment: identity.enrollmentNo,
        photoVersion: identity.photoVersion,
        photoPath: identity.studentPhotoUrl ? `/api/device/v1/photos/${identity.id}?v=${identity.photoVersion}` : null,
      },
      projectionVersion: projection.version,
    }), event.eventId)
    return true
  })
}

export async function updateCanonicalStudentPhoto(decodedData: string, enrollmentNo: string | undefined, studentPhotoUrl: string) {
  const enrollmentKey = normalizeEnrollmentKey(enrollmentNo)
  const doswUrl = normalizeDecodedUrl(decodedData)
  if (!enrollmentKey || !doswUrl || !isStoredStudentPhotoUrl(studentPhotoUrl)) return false

  return runTransactionWithRetry(async (tx) => {
    const identity = await tx.studentIdentity.findFirst({ where: { enrollmentKey, doswUrl } })
    if (!identity || identity.studentPhotoUrl === studentPhotoUrl) return false
    const updatedIdentity = await tx.studentIdentity.update({
      where: { id: identity.id },
      data: { studentPhotoUrl, photoVersion: { increment: 1 }, lastSeenAt: new Date() },
    })
    const projection = await tx.attendanceProjection.findUnique({ where: { enrollmentKey } })
    if (!projection?.latestEffectiveEventId) return true
    const latestEvent = await tx.attendanceEvent.findUnique({ where: { eventId: projection.latestEffectiveEventId } })
    if (!latestEvent) return true

    await emitAttendanceChange(tx, "LATEST_SNAPSHOT", asInputJson({
      event: {
        eventId: latestEvent.eventId,
        occurredAt: latestEvent.occurredAt.toISOString(),
        entryState: projection.currentState,
        sourceType: latestEvent.sourceType,
        status: latestEvent.status,
      },
      student: {
        identityId: updatedIdentity.id,
        name: updatedIdentity.fullName,
        enrollment: updatedIdentity.enrollmentNo,
        photoVersion: updatedIdentity.photoVersion,
        photoPath: `/api/device/v1/photos/${updatedIdentity.id}?v=${updatedIdentity.photoVersion}`,
      },
      projectionVersion: projection.version,
    }), latestEvent.eventId)
    return true
  })
}
