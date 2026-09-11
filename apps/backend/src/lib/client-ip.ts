function firstHeader(headers: Record<string, unknown> | undefined, name: string) {
  const raw = headers?.[name] ?? headers?.[name.toLowerCase()]
  if (Array.isArray(raw)) return String(raw[0] || "")
  return String(raw || "")
}

function normalizeIp(value: string) {
  let ip = value.trim()
  if (ip.startsWith("::ffff:")) ip = ip.slice(7)
  ip = ip.replace(/^\[|\]$/g, "").trim()
  return ip.slice(0, 64)
}

export function clientIp(req: {
  ip?: string
  headers?: Record<string, unknown>
  socket?: { remoteAddress?: string }
}): string {
  const real = normalizeIp(firstHeader(req.headers, "x-real-ip"))
  if (real) return real
  const forwarded = firstHeader(req.headers, "x-forwarded-for")
    .split(",")
    .map((part) => normalizeIp(part))
    .filter(Boolean)
  const fromProxy = forwarded[forwarded.length - 1] || ""
  if (fromProxy) return fromProxy
  const fallback = normalizeIp(req.ip || req.socket?.remoteAddress || "")
  return fallback || "unknown"
}

export function isBlockableIp(ip: string): boolean {
  if (!ip || ip === "unknown") return false
  return /^[0-9a-fA-F:.]+$/.test(ip) && ip.length >= 3
}
