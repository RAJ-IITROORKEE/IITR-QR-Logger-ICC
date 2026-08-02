import type { QrStudentInfo } from "@/types/qr-biometric"

type ReadingWithStudentProfile = {
  decodedData: string
  studentInfo: QrStudentInfo | null
  studentPhotoUrl?: string | null
}

function profileScore(info: QrStudentInfo | null) {
  if (!info) return 0
  return Object.values(info).filter((value) => typeof value === "string" && value.trim()).length
}

export function applyKnownStudentProfile<T extends ReadingWithStudentProfile>(target: T, source: ReadingWithStudentProfile | null): T {
  if (!source) return target
  if (!source.studentInfo && !source.studentPhotoUrl) return target
  return {
    ...target,
    studentInfo: source.studentInfo ? { ...source.studentInfo, ...target.studentInfo } : target.studentInfo,
    studentPhotoUrl: target.studentPhotoUrl ?? source.studentPhotoUrl ?? null,
  }
}

export function enrichWithKnownStudentProfiles<T extends ReadingWithStudentProfile>(readings: T[]): T[] {
  const knownProfiles = new Map<string, ReadingWithStudentProfile>()

  for (const reading of readings) {
    const known = knownProfiles.get(reading.decodedData) ?? { decodedData: reading.decodedData, studentInfo: null, studentPhotoUrl: null }
    knownProfiles.set(reading.decodedData, {
      decodedData: reading.decodedData,
      studentInfo: profileScore(reading.studentInfo) > profileScore(known.studentInfo) ? reading.studentInfo : known.studentInfo,
      studentPhotoUrl: known.studentPhotoUrl ?? reading.studentPhotoUrl ?? null,
    })
  }

  return readings.map((reading) => applyKnownStudentProfile(reading, knownProfiles.get(reading.decodedData) ?? null))
}
