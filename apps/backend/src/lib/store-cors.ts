import type {
  MedusaNextFunction,
  MedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { parseCorsOrigins } from "@medusajs/framework/utils"

function isBareIp(host: string) {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(":")
}

// https://printo.studio and https://www.printo.studio are different browser
// origins. One allowlist entry covers both, so a missing www redirect does
// not block the API.
export function corsWithHostAliases(cors?: string) {
  const parts = String(cors || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
  const extra: string[] = []
  for (const part of parts) {
    if (part.startsWith("/")) {
      continue
    }
    let url: URL
    try {
      url = new URL(part)
    } catch {
      continue
    }
    const host = url.hostname
    if (
      !host ||
      host === "localhost" ||
      host.endsWith(".localhost") ||
      isBareIp(host)
    ) {
      continue
    }
    const alias = host.startsWith("www.") ? host.slice(4) : `www.${host}`
    if (!alias || alias === host) {
      continue
    }
    const aliased = new URL(url.origin)
    aliased.hostname = alias
    extra.push(aliased.origin)
  }
  return [...new Set([...parts, ...extra])].join(",")
}

export function originAllowed(
  origin: string,
  storeCors = process.env.STORE_CORS || ""
) {
  if (!origin) {
    return false
  }
  return parseCorsOrigins(corsWithHostAliases(storeCors)).some((allowed) =>
    allowed instanceof RegExp ? allowed.test(origin) : allowed === origin
  )
}

export function applyStoreCors(
  req: MedusaRequest,
  res: MedusaResponse,
  next: MedusaNextFunction
) {
  const origin = String(req.headers.origin || "")
  if (originAllowed(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin)
    res.setHeader("Access-Control-Allow-Credentials", "true")
    res.setHeader(
      "Access-Control-Allow-Methods",
      "GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS"
    )
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization, x-publishable-api-key"
    )
    res.setHeader("Access-Control-Max-Age", "86400")
    res.setHeader("Vary", "Origin")
  }
  if (req.method === "OPTIONS") {
    res.status(204).end()
    return
  }
  next()
}
