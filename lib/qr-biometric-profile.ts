import type { QrStudentInfo } from "@/types/qr-biometric"

type ReadingWithStudentProfile = {
  decodedData: string
  studentInfo: QrStudentInfo | null
}

function profileScore(info: QrStudentInfo | null) {
  if (!info) return 0
  return Object.values(info).filter((value) => typeof value === "string" && value.trim()).length
}

export function applyKnownStudentProfile<T extends ReadingWithStudentProfile>(target: T, source: ReadingWithStudentProfile | null): T {
  if (!source?.studentInfo || profileScore(source.studentInfo) === 0) return target
  return {
    ...target,
    studentInfo: { ...source.studentInfo, ...target.studentInfo },
  }
}

export function enrichWithKnownStudentProfiles<T extends ReadingWithStudentProfile>(readings: T[]): T[] {
  const knownProfiles = new Map<string, ReadingWithStudentProfile>()

  for (const reading of readings) {
    const known = knownProfiles.get(reading.decodedData)
    if (profileScore(reading.studentInfo) > profileScore(known?.studentInfo ?? null)) knownProfiles.set(reading.decodedData, reading)
  }

  return readings.map((reading) => applyKnownStudentProfile(reading, knownProfiles.get(reading.decodedData) ?? null))
}
