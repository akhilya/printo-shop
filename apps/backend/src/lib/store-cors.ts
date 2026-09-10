import type {
  MedusaNextFunction,
  MedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { parseCorsOrigins } from "@medusajs/framework/utils"

export function originAllowed(
  origin: string,
  storeCors = process.env.STORE_CORS || ""
) {
  if (!origin) {
    return false
  }
  return parseCorsOrigins(storeCors).some((allowed) =>
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
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS")
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization, x-publishable-api-key"
    )
    res.setHeader("Vary", "Origin")
  }
  if (req.method === "OPTIONS") {
    res.status(204).end()
    return
  }
  next()
}
