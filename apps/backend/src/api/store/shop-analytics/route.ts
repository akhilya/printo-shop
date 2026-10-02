import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import {
  analyticsHitAllowed,
  parseAnalyticsHit,
  recordShopAnalyticsHit,
} from "../../../lib/shop-analytics"

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const hit = parseAnalyticsHit(
    req.body,
    String(req.headers["user-agent"] || "")
  )
  if (!hit || !analyticsHitAllowed(hit.visitor, hit.kind, hit.path)) {
    res.status(204).end()
    return
  }
  res.status(204).end()
  void recordShopAnalyticsHit(req.scope, hit).catch(() => undefined)
}
