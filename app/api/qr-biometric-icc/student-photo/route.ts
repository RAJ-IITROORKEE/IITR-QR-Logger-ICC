import { NextResponse } from "next/server"

import { extractStudentInfo, isDoswStudentUrl, normalizeDecodedUrl, normalizeDoswStudentPhotoUrl } from "@/lib/qr-biometric-student"

export const dynamic = "force-dynamic"
export const revalidate = 0

export async function GET(request: Request) {
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
        accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        ...(cookieHeader ? { cookie: cookieHeader } : {}),
        referer: profileUrl ?? "https://dosw.iitr.ac.in/",
        "user-agent": "Mozilla/5.0 (compatible; QR-Logger-ICC/1.0)",
      },
    })

    if (!response.ok) {
      return NextResponse.json({ success: false, error: `Student photo returned HTTP ${response.status}` }, { status: response.status })
    }

    const contentType = response.headers.get("content-type") ?? "image/jpeg"
    if (!contentType.toLowerCase().startsWith("image/")) {
      return NextResponse.json({ success: false, error: "Student photo response was not an image" }, { status: 502 })
    }

    const image = await response.arrayBuffer()
    return new NextResponse(image, {
      status: 200,
      headers: {
        "cache-control": "public, max-age=3600, stale-while-revalidate=86400",
        "content-length": String(image.byteLength),
        "content-type": contentType,
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch student photo"
    return NextResponse.json({ success: false, error: message }, { status: 502 })
  }
}
