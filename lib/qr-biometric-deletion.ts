export type DeletionScope = {
  deviceId: string | null
  from: Date | null
  to: Date | null
}

export type DeletableReading = {
  id: string
  deviceId: string
  createdAt?: Date
  timestamp?: string
}

export function matchesDeletionScope(reading: DeletableReading, scope: DeletionScope): boolean {
  const timestamp = reading.createdAt ?? (reading.timestamp ? new Date(reading.timestamp) : null)
  if (!timestamp || Number.isNaN(timestamp.getTime())) return false
  return (!scope.deviceId || reading.deviceId === scope.deviceId) &&
    (!scope.from || timestamp >= scope.from) &&
    (!scope.to || timestamp < scope.to)
}
