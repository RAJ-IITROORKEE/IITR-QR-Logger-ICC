import sharp from "sharp"

export const DEVICE_PROFILE_PHOTO_EDGE = 220

export async function readBoundedPhotoStream(
  stream: ReadableStream<Uint8Array>,
  maximumBytes: number,
): Promise<Buffer> {
  const reader = stream.getReader()
  const chunks: Buffer[] = []
  let total = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > maximumBytes) {
        await reader.cancel("device profile photo exceeds maximum size")
        throw new RangeError("Device profile photo exceeds maximum size")
      }
      chunks.push(Buffer.from(value))
    }
  } finally {
    reader.releaseLock()
  }
  return Buffer.concat(chunks, total)
}

export async function normalizeDeviceProfilePhoto(input: Buffer): Promise<Buffer> {
  return sharp(input, {
    animated: false,
    failOn: "error",
    limitInputPixels: 16_777_216,
  })
    .rotate()
    .resize(DEVICE_PROFILE_PHOTO_EDGE, DEVICE_PROFILE_PHOTO_EDGE, {
      fit: "cover",
      position: "centre",
    })
    .flatten({ background: "#ffffff" })
    .toColourspace("srgb")
    .jpeg({
      quality: 82,
      progressive: false,
      chromaSubsampling: "4:2:0",
    })
    .toBuffer()
}
