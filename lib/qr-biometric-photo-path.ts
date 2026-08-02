import { createHash } from "node:crypto"

function extensionForContentType(contentType: string): string {
  const normalized = contentType.toLowerCase().split(";", 1)[0]
  if (normalized === "image/avif") return "avif"
  if (normalized === "image/png") return "png"
  if (normalized === "image/webp") return "webp"
  if (normalized === "image/gif") return "gif"
  return "jpg"
}

export function buildStoredStudentPhotoPath(decodedData: string, contentType: string): string {
  const digest = createHash("sha256").update(decodedData.trim()).digest("hex")
  return `student-photos/${digest}.${extensionForContentType(contentType)}`
}
