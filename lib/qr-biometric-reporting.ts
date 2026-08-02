export const QR_REPORTING_TIME_ZONE = "Asia/Kolkata"

const REPORTING_OFFSET_MS = 330 * 60 * 1000
const CALENDAR_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

function parseCalendarDate(value: string) {
  const match = value.match(CALENDAR_DATE_PATTERN)
  if (!match) return null

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const normalized = new Date(Date.UTC(year, month - 1, day))
  if (normalized.getUTCFullYear() !== year || normalized.getUTCMonth() !== month - 1 || normalized.getUTCDate() !== day) return null
  return { year, month, day }
}

function reportingMidnightUtc(year: number, monthIndex: number, day: number) {
  return new Date(Date.UTC(year, monthIndex, day) - REPORTING_OFFSET_MS)
}

export function reportingDateKey(date: Date): string {
  const shifted = new Date(date.getTime() + REPORTING_OFFSET_MS)
  const year = shifted.getUTCFullYear()
  const month = String(shifted.getUTCMonth() + 1).padStart(2, "0")
  const day = String(shifted.getUTCDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

export function isSameReportingDay(date: Date, now = new Date()) {
  return reportingDateKey(date) === reportingDateKey(now)
}

export function isSameReportingMonth(date: Date, now = new Date()) {
  return reportingDateKey(date).slice(0, 7) === reportingDateKey(now).slice(0, 7)
}

export function parseReportingDateBoundary(value: string | null, boundary: "start" | "end"): Date | null {
  if (!value) return null
  const calendarDate = parseCalendarDate(value)
  if (calendarDate) {
    return reportingMidnightUtc(calendarDate.year, calendarDate.month - 1, calendarDate.day + (boundary === "end" ? 1 : 0))
  }

  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

export function parseReportingMonthRange(value: string | null): { start: Date; end: Date } | null {
  if (!value || !/^\d{4}-\d{2}$/.test(value)) return null
  const [year, month] = value.split("-").map(Number)
  if (!year || !month || month < 1 || month > 12) return null
  return {
    start: reportingMidnightUtc(year, month - 1, 1),
    end: reportingMidnightUtc(year, month, 1),
  }
}
