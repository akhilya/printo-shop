const PHOTO_CACHE_KEY = "1280"

/** Bust the year-long static cache after photos are stored smaller. */
export function shopPhotoSrc(url) {
  const value = String(url || "")
  if (!value || value.startsWith("blob:") || value.startsWith("data:")) return value
  if (!value.includes("/static/")) return value
  if (/[?&]v=1280(?:&|$)/.test(value)) return value
  return `${value}${value.includes("?") ? "&" : "?"}v=${PHOTO_CACHE_KEY}`
}
