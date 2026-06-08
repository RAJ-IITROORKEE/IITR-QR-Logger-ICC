export type QrEntryState = "IN" | "OUT"
export type QrStudentInfoStatus = "not_applicable" | "scraped" | "failed"

export interface QrStudentInfo {
  enrollmentNo?: string
  fullName?: string
  emailId?: string
  year?: string
  mobileNo?: string
  fatherName?: string
  fatherMobileNo?: string
  bloodGroup?: string
  bhawan?: string
  roomNo?: string
  address?: string
  city?: string
  state?: string
  pincode?: string
  validTill?: string
  photoUrl?: string
  [key: string]: string | undefined
}

export interface QrBiometricReading {
  id: string
  deviceId: string
  decodedData: string
  decodedUrl: string | null
  scanStatus: string
  entryState: QrEntryState
  characterCount: number
  studentInfo: QrStudentInfo | null
  studentInfoStatus: QrStudentInfoStatus
  studentInfoError: string | null
  timestamp: string
}

export interface QrBiometricStats {
  totalScans: number
  uniqueCodes: number
  uniqueDevices: number
  currentIn: number
  currentOut: number
  scrapedStudents: number
  dailyScans: number
  monthlyScans: number
  lastScanAt: string | null
  avgCharacters: number | null
}

export interface QrBiometricDeviceSummary {
  deviceId: string
  totalScans: number
  lastScanAt: string
}

export interface QrBiometricAnalysis extends QrBiometricStats {
  latestDecodedData: string | null
  latestDeviceId: string | null
  latestStatus: string | null
  latestEntryState: QrEntryState | null
  latestStudentInfo: QrStudentInfo | null
  deviceSummaries: QrBiometricDeviceSummary[]
  entryTimeline: Array<{ date: string; total: number; inCount: number; outCount: number }>
}

export interface QrBiometricApiResponse {
  success: boolean
  module: string
  endpoint: string
  storage: string
  expectedPayload: {
    deviceId: string
    decodedData: string
  }
  query: {
    limit: number
    page: number
    deviceId: string | null
    search: string | null
    sort: string
    order: "asc" | "desc"
    from: string | null
    to: string | null
    month: string | null
  }
  count: number
  totalCount: number
  manualLookup?: {
    enrollment: string
    found: boolean
    currentStatus: QrEntryState | null
    defaultEntryState: QrEntryState | null
    reading: QrBiometricReading | null
  } | null
  latest: QrBiometricReading | null
  readings: QrBiometricReading[]
  analysis: QrBiometricAnalysis
  stats: QrBiometricStats
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
    hasNextPage: boolean
    hasPrevPage: boolean
  }
  health: {
    status: "online" | "offline"
    lastSeenSeconds: number | null
  }
  system: {
    dbConnected: boolean
    queuedWrites: number
    flushedWrites: number
    liveBufferCount: number
  }
  serverTime: string
  warning: string | null
}
