// Browser-side image intake for machine photos.
//
// Everything in this app lives in localStorage, which is a ~5MB budget shared
// by every table. A raw phone photo (3-8MB as a data URL) would blow that
// budget on its own, so uploads are downscaled and re-encoded before they are
// ever stored.

/** Longest edge, in pixels, of a stored machine photo. */
const MAX_EDGE = 320
/** Guard against pathological source files before we even decode them. */
const MAX_SOURCE_BYTES = 12 * 1024 * 1024

export type ImageReadResult = { dataUrl: string } | { error: string }

/**
 * Read an image File, downscale it so its longest edge is at most MAX_EDGE,
 * and return it as a WebP data URL suitable for storing in `image_key`.
 */
export async function readImageAsDataUrl(file: File): Promise<ImageReadResult> {
  if (!file.type.startsWith("image/")) {
    return { error: "That file is not an image. Please pick a PNG, JPG or WebP." }
  }
  if (file.size > MAX_SOURCE_BYTES) {
    return { error: "That image is larger than 12 MB. Please pick a smaller file." }
  }

  const objectUrl = URL.createObjectURL(file)
  try {
    const img = await loadImage(objectUrl)
    const scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height))
    const width = Math.max(1, Math.round(img.width * scale))
    const height = Math.max(1, Math.round(img.height * scale))

    const canvas = document.createElement("canvas")
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext("2d")
    if (!ctx) return { error: "Could not process the image in this browser." }
    ctx.drawImage(img, 0, 0, width, height)

    // WebP keeps transparency (product cutouts) and is far smaller than PNG.
    const dataUrl = canvas.toDataURL("image/webp", 0.85)
    if (!dataUrl.startsWith("data:image/")) {
      return { error: "Could not process the image in this browser." }
    }
    return { dataUrl }
  } catch {
    return { error: "That image could not be read. It may be corrupt or an unsupported format." }
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new window.Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error("decode failed"))
    img.src = src
  })
}
