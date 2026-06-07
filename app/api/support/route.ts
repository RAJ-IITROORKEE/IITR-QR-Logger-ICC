import { NextResponse } from "next/server"

import { prisma } from "@/lib/prisma"
import type { SupportInquiry, SupportStatus } from "@/types/support"

export const dynamic = "force-dynamic"
export const revalidate = 0

const DEFAULT_LIMIT = 12
const MAX_LIMIT = 100

function parseLimit(value: string | null) {
  if (!value) return DEFAULT_LIMIT
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed) || parsed < 1) return DEFAULT_LIMIT
  return Math.min(parsed, MAX_LIMIT)
}

function parsePage(value: string | null) {
  if (!value) return 1
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed) || parsed < 1) return 1
  return parsed
}

function parseStatus(value: string | null): SupportStatus | "all" {
  if (value === "new" || value === "in-progress" || value === "resolved") return value
  return "all"
}

function toApiInquiry(record: {
  id: string
  name: string
  email: string
  subject: string
  message: string
  status: string
  createdAt: Date
  updatedAt: Date
}): SupportInquiry {
  return {
    id: record.id,
    name: record.name,
    email: record.email,
    subject: record.subject,
    message: record.message,
    status: parseStatus(record.status) === "all" ? "new" : parseStatus(record.status),
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  }
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  const name = typeof body?.name === "string" ? body.name.trim() : ""
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : ""
  const subject = typeof body?.subject === "string" ? body.subject.trim() : ""
  const message = typeof body?.message === "string" ? body.message.trim() : ""

  if (!name || !email || !subject || !message) return NextResponse.json({ success: false, module: "support", error: "Invalid payload. Expected { name, email, subject, message }" }, { status: 400 })
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ success: false, module: "support", error: "Please provide a valid email address" }, { status: 400 })

  try {
    const inquiry = await prisma.supportInquiry.create({ data: { name, email, subject, message, status: "new" } })
    return NextResponse.json({ success: true, module: "support", message: "Support request submitted successfully.", inquiry: toApiInquiry(inquiry) })
  } catch (error) {
    console.error("[support] Failed to create inquiry", error)
    return NextResponse.json({ success: false, module: "support", error: "Failed to submit support request" }, { status: 500 })
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const page = parsePage(searchParams.get("page"))
  const limit = parseLimit(searchParams.get("limit"))
  const search = searchParams.get("search")?.trim() ?? ""
  const status = parseStatus(searchParams.get("status"))

  const where = {
    ...(status !== "all" ? { status } : {}),
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" as const } },
            { email: { contains: search, mode: "insensitive" as const } },
            { subject: { contains: search, mode: "insensitive" as const } },
            { message: { contains: search, mode: "insensitive" as const } },
          ],
        }
      : {}),
  }

  try {
    const [totalCount, records, total, totalNew, totalInProgress, totalResolved] = await Promise.all([
      prisma.supportInquiry.count({ where }),
      prisma.supportInquiry.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * limit, take: limit }),
      prisma.supportInquiry.count(),
      prisma.supportInquiry.count({ where: { status: "new" } }),
      prisma.supportInquiry.count({ where: { status: "in-progress" } }),
      prisma.supportInquiry.count({ where: { status: "resolved" } }),
    ])

    const totalPages = totalCount === 0 ? 1 : Math.ceil(totalCount / limit)
    const safePage = Math.min(page, totalPages)

    return NextResponse.json({
      success: true,
      module: "support",
      query: { page: safePage, limit, search: search || null, status },
      count: records.length,
      totalCount,
      inquiries: records.map(toApiInquiry),
      pagination: { page: safePage, limit, total: totalCount, totalPages, hasNextPage: safePage < totalPages, hasPrevPage: safePage > 1 },
      stats: { total, new: totalNew, inProgress: totalInProgress, resolved: totalResolved },
      serverTime: new Date().toISOString(),
    })
  } catch (error) {
    console.error("[support] Failed to fetch inquiries", error)
    return NextResponse.json({ success: false, module: "support", error: "Failed to fetch support inquiries" }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  const body = await request.json().catch(() => null)
  const id = typeof body?.id === "string" ? body.id.trim() : ""
  const status = parseStatus(typeof body?.status === "string" ? body.status : null)
  if (!id || status === "all") return NextResponse.json({ success: false, module: "support", error: "Invalid payload. Expected { id, status }" }, { status: 400 })

  try {
    const inquiry = await prisma.supportInquiry.update({ where: { id }, data: { status } })
    return NextResponse.json({ success: true, module: "support", message: "Support request status updated", inquiry: toApiInquiry(inquiry) })
  } catch (error) {
    console.error("[support] Failed to update inquiry", error)
    return NextResponse.json({ success: false, module: "support", error: "Failed to update support request" }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  const body = await request.json().catch(() => null)
  const id = typeof body?.id === "string" ? body.id.trim() : ""
  if (!id) return NextResponse.json({ success: false, module: "support", error: "Missing support inquiry id" }, { status: 400 })

  try {
    await prisma.supportInquiry.delete({ where: { id } })
    return NextResponse.json({ success: true, module: "support", deleted: id })
  } catch (error) {
    console.error("[support] Failed to delete inquiry", error)
    return NextResponse.json({ success: false, module: "support", error: "Failed to delete support request" }, { status: 500 })
  }
}
