const MAX_BYTES = 5 * 1024 * 1024

export function decodeReviewImageBase64(
  content: string,
  maxBytes = MAX_BYTES
): Buffer {
  if (typeof content !== "string" || !content.trim()) {
    throw new Error("empty")
  }
  if (content.length > maxBytes * 2) {
    throw new Error("too_large")
  }
  const raw = content.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, "")
  const buf = Buffer.from(raw, "base64")
  if (!buf.length) {
    throw new Error("empty")
  }
  if (buf.length > maxBytes) {
    throw new Error("too_large")
  }
  return buf
}

export { MAX_BYTES }
