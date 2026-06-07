import type { QrStudentInfo } from "@/types/qr-biometric"

const STUDENT_FIELDS: Array<{ key: keyof QrStudentInfo; labels: string[] }> = [
  { key: "enrollmentNo", labels: ["Enrollment No", "Enrolment No"] },
  { key: "fullName", labels: ["Full Name", "Student Name", "Name"] },
  { key: "emailId", labels: ["Email ID", "Email"] },
  { key: "year", labels: ["Year"] },
  { key: "mobileNo", labels: ["Mobile No", "Mobile Number"] },
  { key: "fatherName", labels: ["Fathers Name", "Father's Name", "Father Name"] },
  { key: "fatherMobileNo", labels: ["Fathers Mobile No", "Father's Mobile No", "Father Mobile No"] },
  { key: "bloodGroup", labels: ["Blood Group"] },
  { key: "bhawan", labels: ["Bhawan"] },
  { key: "roomNo", labels: ["Room No", "Room Number"] },
  { key: "address", labels: ["Address"] },
  { key: "city", labels: ["City"] },
  { key: "state", labels: ["State"] },
  { key: "pincode", labels: ["Pincode", "Pin Code"] },
  { key: "validTill", labels: ["Valid Till", "Valid Upto", "Valid Up To"] },
]

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function decodeHtmlEntities(value: string): string {
  const named: Record<string, string> = { amp: "&", apos: "'", gt: ">", lt: "<", nbsp: " ", quot: '"' }
  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity: string) => {
    if (entity[0] === "#") {
      const isHex = entity[1]?.toLowerCase() === "x"
      const codePoint = Number.parseInt(entity.slice(isHex ? 2 : 1), isHex ? 16 : 10)
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match
    }
    return named[entity.toLowerCase()] ?? match
  })
}

function htmlToLines(html: string): string[] {
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<\/(p|tr|div|li|h[1-6])>/gi, "\n")
    .replace(/<\/(td|th)>/gi, "\t")
    .replace(/<[^>]+>/g, " ")

  return decodeHtmlEntities(text)
    .split(/[\n\r]+/)
    .map((line) => line.replace(/[\t ]+/g, " ").trim())
    .filter(Boolean)
}

function readLabelValue(lines: string[], labels: string[]): string | undefined {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    for (const label of labels) {
      const pattern = escapeRegex(label).replace(/\\ /g, "\\s+")
      const match = line.match(new RegExp(`^${pattern}\\.?\\s*:?\\s*(.*)$`, "i"))
      const value = match?.[1]?.trim()
      if (value) return value
      if (match && lines[i + 1]) return lines[i + 1].trim()
    }
  }
  return undefined
}

function resolveProfileAssetUrl(baseUrl: string, src: string | undefined): string | undefined {
  if (!src) return undefined
  try {
    return new URL(decodeHtmlEntities(src), baseUrl).toString()
  } catch {
    return undefined
  }
}

function readAttribute(tag: string, attribute: string): string | undefined {
  const match = tag.match(new RegExp(`\\b${attribute}=(?:["']([^"']+)["']|([^\\s>]+))`, "i"))
  return match?.[1] ?? match?.[2]
}

function readStudentImageSrc(html: string): string | undefined {
  const imageTags = html.match(/<img\b[^>]*>/gi) ?? []
  const studentImage = imageTags.find((tag) => readAttribute(tag, "id")?.toLowerCase() === "imgstimage")
  return readAttribute(studentImage ?? imageTags[0] ?? "", "src")
}

export function buildDoswStudentPhotoUrl(enrollmentNo: string | undefined): string | undefined {
  const enrollment = enrollmentNo?.trim()
  if (!enrollment) return undefined
  return `https://dosw.iitr.ac.in/GetImageHandler.ashx?enrollment=${encodeURIComponent(enrollment)}&type=photo`
}

export function addDoswStudentPhotoFallback(info: QrStudentInfo): QrStudentInfo {
  if (info.photoUrl) return info
  const fallbackPhotoUrl = buildDoswStudentPhotoUrl(info.enrollmentNo)
  return fallbackPhotoUrl ? { ...info, photoUrl: fallbackPhotoUrl } : info
}

export function normalizeDoswStudentPhotoUrl(photoUrl: string | undefined): string | null {
  if (!photoUrl) return null

  try {
    const url = new URL(decodeHtmlEntities(photoUrl.trim()))
    const hostname = url.hostname.toLowerCase().replace(/^www\./, "")
    const pathname = url.pathname.toLowerCase()
    if (hostname !== "dosw.iitr.ac.in" || pathname !== "/getimagehandler.ashx") return null
    if (!url.searchParams.get("enrollment") || url.searchParams.get("type")?.toLowerCase() !== "photo") return null
    return url.toString()
  } catch {
    return null
  }
}

export function buildQrStudentPhotoProxySrc(photoUrl: string | undefined, enrollmentNo?: string, profileUrl?: string | null): string | undefined {
  const normalized = normalizeDoswStudentPhotoUrl(photoUrl) ?? normalizeDoswStudentPhotoUrl(buildDoswStudentPhotoUrl(enrollmentNo))
  if (!normalized) return undefined

  const params = new URLSearchParams({ src: normalized })
  if (profileUrl && isDoswStudentUrl(profileUrl)) params.set("profile", profileUrl)
  return `/api/qr-biometric-icc/student-photo?${params.toString()}`
}

export function normalizeDecodedUrl(decodedData: string): string | null {
  try {
    const url = new URL(decodedData.trim())
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null
  } catch {
    return null
  }
}

export function isDoswStudentUrl(decodedData: string): boolean {
  const decodedUrl = normalizeDecodedUrl(decodedData)
  if (!decodedUrl) return false
  const url = new URL(decodedUrl)
  const hostname = url.hostname.toLowerCase()
  const pathname = url.pathname.toLowerCase().replace(/\/$/, "")
  return url.protocol === "https:" && hostname === "dosw.iitr.ac.in" && pathname === "/studentproxy.aspx" && Boolean(url.searchParams.get("id"))
}

export function extractStudentInfo(html: string, profileUrl: string): QrStudentInfo {
  const lines = htmlToLines(html)
  const info: QrStudentInfo = {}
  for (const field of STUDENT_FIELDS) {
    const value = readLabelValue(lines, field.labels)
    if (value) info[field.key] = value
  }
  const photoUrl = resolveProfileAssetUrl(profileUrl, readStudentImageSrc(html))
  if (photoUrl) info.photoUrl = photoUrl
  return addDoswStudentPhotoFallback(info)
}
