import { NextRequest, NextResponse } from "next/server"

import { ACCESS_SESSION_COOKIE, ADMIN_ACCESS_ROLES, verifyAccessSession } from "@/lib/access-auth"
import { ADMIN_SESSION_COOKIE, verifyAdminSession } from "@/lib/admin-auth"
import { prisma } from "@/lib/prisma"
import { normalizeDecodedUrl } from "@/lib/qr-biometric-student"

export const dynamic = "force-dynamic"
export const revalidate = 0

function parseDate(value: string | null): Date | null {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function parseMonthRange(value: string | null): { start: Date; end: Date } | null {
  if (!value || !/^\d{4}-\d{2}$/.test(value)) return null
  const [year, month] = value.split("-").map(Number)
  if (!year || !month || month < 1 || month > 12) return null
  return {
    start: new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0)),
    end: new Date(Date.UTC(year, month, 1, 0, 0, 0, 0)),
  }
}

function csvEscape(value: unknown) {
  const text = value === null || value === undefined ? "" : String(value)
  return `"${text.replace(/"/g, '""')}"`
}

function readStudentInfo(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {}
  const output: Record<string, string> = {}
  for (const [key, raw] of Object.entries(value)) {
    if (typeof raw === "string") output[key] = raw
  }
  return output
}

export async function GET(request: NextRequest) {
  if (!verifyAdminSession(request.cookies.get(ADMIN_SESSION_COOKIE)?.value) && !(await verifyAccessSession(request.cookies.get(ACCESS_SESSION_COOKIE)?.value, ADMIN_ACCESS_ROLES))) {
    return NextResponse.json({ success: false, module: "qr-biometric-icc", error: "Unauthorized" }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const deviceId = searchParams.get("deviceId")?.trim()
  const monthRange = parseMonthRange(searchParams.get("month"))
  const from = monthRange?.start ?? parseDate(searchParams.get("from"))
  const to = monthRange?.end ?? parseDate(searchParams.get("to"))

  const where: { deviceId?: string; createdAt?: { gte?: Date; lt?: Date } } = {}
  if (deviceId) where.deviceId = deviceId
  if (from || to) where.createdAt = { ...(from ? { gte: from } : {}), ...(to ? { lt: to } : {}) }

  const records = await prisma.qrBiometricReading.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 10000,
  })

  const headers = ["id", "timestamp", "deviceId", "entryState", "scanStatus", "studentName", "enrollmentNo", "email", "bhawan", "decodedUrl", "decodedData", "characterCount"]
  const rows = records.map((record) => {
    const student = readStudentInfo(record.studentInfo)
    return [
      record.id,
      record.createdAt.toISOString(),
      record.deviceId,
      record.entryState,
      record.scanStatus,
      student.fullName,
      student.enrollmentNo,
      student.emailId,
      student.bhawan,
      normalizeDecodedUrl(record.decodedData),
      record.decodedData,
      record.characterCount,
    ]
  })

  const csv = [headers, ...rows].map((row) => row.map(csvEscape).join(",")).join("\n")
  const fileLabel = searchParams.get("month") ?? new Date().toISOString().slice(0, 10)

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="qr-biometric-logs-${fileLabel}.csv"`,
    },
  })
}
