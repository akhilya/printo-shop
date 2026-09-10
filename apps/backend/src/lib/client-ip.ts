export function clientIp(req: {
  ip?: string
  headers?: Record<string, unknown>
  socket?: { remoteAddress?: string }
}): string {
  const forwarded = String(req.headers?.["x-forwarded-for"] || "")
    .split(",")[0]
    .trim()
  let ip = forwarded || req.ip || req.socket?.remoteAddress || ""
  if (ip.startsWith("::ffff:")) ip = ip.slice(7)
  ip = ip.replace(/^\[|\]$/g, "").trim()
  return ip.slice(0, 64) || "unknown"
}

export function isBlockableIp(ip: string): boolean {
  if (!ip || ip === "unknown") return false
  return /^[0-9a-fA-F:.]+$/.test(ip) && ip.length >= 3
}
