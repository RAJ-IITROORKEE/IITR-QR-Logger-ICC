import { NextRequest, NextResponse } from "next/server"

import { ACCESS_SESSION_COOKIE, verifyAccessSession } from "@/lib/access-auth"
import { ADMIN_SESSION_COOKIE, verifyAdminSession } from "@/lib/admin-auth"
import { normalizeStudentPhotoContentType } from "@/lib/qr-biometric-photo"
import { extractStudentInfo, isDoswStudentUrl, normalizeDecodedUrl, normalizeDoswStudentPhotoUrl } from "@/lib/qr-biometric-student"

export const dynamic = "force-dynamic"
export const revalidate = 0

export async function GET(request: NextRequest) {
  const hasAccess = verifyAdminSession(request.cookies.get(ADMIN_SESSION_COOKIE)?.value)
    || await verifyAccessSession(request.cookies.get(ACCESS_SESSION_COOKIE)?.value)
  if (!hasAccess) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const requestedPhotoUrl = normalizeDoswStudentPhotoUrl(searchParams.get("src") ?? undefined)
  const decodedProfileUrl = normalizeDecodedUrl(searchParams.get("profile") ?? "")
  const profileUrl = decodedProfileUrl && isDoswStudentUrl(decodedProfileUrl) ? decodedProfileUrl : null
  let photoUrl = requestedPhotoUrl
  let cookieHeader: string | undefined

  if (!photoUrl && !profileUrl) {
    return NextResponse.json({ success: false, error: "Invalid DOSW student photo URL" }, { status: 400 })
  }

  try {
    if (profileUrl) {
      const profileResponse = await fetch(profileUrl, {
        cache: "no-store",
        headers: {
          accept: "text/html,application/xhtml+xml",
          "user-agent": "Mozilla/5.0 (compatible; QR-Logger-ICC/1.0)",
        },
      })

      if (profileResponse.ok) {
        const cookies = typeof profileResponse.headers.getSetCookie === "function"
          ? profileResponse.headers.getSetCookie()
          : [profileResponse.headers.get("set-cookie")].filter((cookie): cookie is string => Boolean(cookie))
        cookieHeader = cookies.map((cookie) => cookie.split(";")[0]).join("; ") || undefined

        const html = await profileResponse.text()
        photoUrl = normalizeDoswStudentPhotoUrl(extractStudentInfo(html, profileUrl).photoUrl) ?? photoUrl
      }
    }

    if (!photoUrl) {
      return NextResponse.json({ success: false, error: "Student profile did not contain a readable photo URL" }, { status: 502 })
    }

    const response = await fetch(photoUrl, {
      cache: "no-store",
      headers: {
        accept: "image/avif,image/webp,image/png,image/jpeg,image/gif;q=0.9,*/*;q=0.1",
        ...(cookieHeader ? { cookie: cookieHeader } : {}),
        referer: profileUrl ?? "https://dosw.iitr.ac.in/",
        "user-agent": "Mozilla/5.0 (compatible; QR-Logger-ICC/1.0)",
      },
    })

    if (!response.ok) {
      return NextResponse.json({ success: false, error: `Student photo returned HTTP ${response.status}` }, { status: response.status })
    }

    const contentType = normalizeStudentPhotoContentType(response.headers.get("content-type"))
    if (!contentType) {
      return NextResponse.json({ success: false, error: "Student photo response was not an allowed raster image" }, { status: 502 })
    }

    const image = await response.arrayBuffer()
    return new NextResponse(image, {
      status: 200,
      headers: {
        "cache-control": "private, no-store",
        "content-length": String(image.byteLength),
        "content-type": contentType,
        "x-content-type-options": "nosniff",
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch student photo"
    return NextResponse.json({ success: false, error: message }, { status: 502 })
  }
}
