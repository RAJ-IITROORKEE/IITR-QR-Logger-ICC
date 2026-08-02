const STORED_PHOTO_PREFIX = "/student-photos/"
const ALLOWED_PHOTO_CONTENT_TYPES = new Set(["image/avif", "image/gif", "image/jpeg", "image/png", "image/webp"])

export function normalizeStudentPhotoContentType(value: string | undefined | null): string | null {
  const normalized = value?.toLowerCase().split(";", 1)[0].trim()
  return normalized && ALLOWED_PHOTO_CONTENT_TYPES.has(normalized) ? normalized : null
}

export function isAllowedStudentPhotoContentType(value: string | undefined | null): boolean {
  return normalizeStudentPhotoContentType(value) !== null
}

export function isStoredStudentPhotoUrl(value: string | undefined | null): value is string {
  if (!value) return false
  try {
    const url = new URL(value)
    return url.protocol === "https:" && url.hostname.endsWith(".private.blob.vercel-storage.com") && url.pathname.startsWith(STORED_PHOTO_PREFIX)
  } catch {
    return false
  }
}

export function buildStoredStudentPhotoProxySrc(photoUrl: string | undefined | null): string | undefined {
  if (!isStoredStudentPhotoUrl(photoUrl)) return undefined
  return `/api/qr-biometric-icc/stored-student-photo?src=${encodeURIComponent(photoUrl)}`
}
