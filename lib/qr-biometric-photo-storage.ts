import { put } from "@vercel/blob"

import { normalizeStudentPhotoContentType } from "./qr-biometric-photo.ts"
import { buildStoredStudentPhotoPath } from "./qr-biometric-photo-path.ts"
import { normalizeDoswStudentPhotoUrl } from "./qr-biometric-student.ts"

const PHOTO_TIMEOUT_MS = 5000
const MAX_PHOTO_BYTES = 5 * 1024 * 1024

export async function fetchAndStoreStudentPhoto(decodedData: string, photoUrl: string | undefined, cookieHeader?: string, profileUrl?: string): Promise<string | null> {
  const normalizedPhotoUrl = normalizeDoswStudentPhotoUrl(photoUrl)
  if (!normalizedPhotoUrl) return null

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), PHOTO_TIMEOUT_MS)

  try {
    const response = await fetch(normalizedPhotoUrl, {
      cache: "no-store",
      headers: {
        accept: "image/avif,image/webp,image/png,image/jpeg,image/gif;q=0.9,*/*;q=0.1",
        ...(cookieHeader ? { cookie: cookieHeader } : {}),
        referer: profileUrl ?? "https://dosw.iitr.ac.in/",
        "user-agent": "Mozilla/5.0 (compatible; QR-Logger-ICC/1.0)",
      },
      signal: controller.signal,
    })
    if (!response.ok) throw new Error(`Student photo returned HTTP ${response.status}`)

    const contentType = normalizeStudentPhotoContentType(response.headers.get("content-type"))
    if (!contentType) throw new Error("Student photo response was not an allowed raster image")

    const contentLength = Number(response.headers.get("content-length"))
    if (Number.isFinite(contentLength) && contentLength > MAX_PHOTO_BYTES) throw new Error("Student photo exceeded the size limit")

    const image = await response.arrayBuffer()
    if (image.byteLength === 0 || image.byteLength > MAX_PHOTO_BYTES) throw new Error("Student photo exceeded the size limit")

    const blob = await put(buildStoredStudentPhotoPath(decodedData, contentType), image, {
      access: "private",
      allowOverwrite: true,
      cacheControlMaxAge: 31536000,
      contentType,
    })
    return blob.url
  } finally {
    clearTimeout(timeout)
  }
}
