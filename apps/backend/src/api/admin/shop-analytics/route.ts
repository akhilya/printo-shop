import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import {
  loadShopAnalytics,
  parseAnalyticsPeriod,
} from "../../../lib/shop-analytics"

export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) {
  const period = parseAnalyticsPeriod(req.query.period)
  const analytics = await loadShopAnalytics(req.scope, period)
  res.json({ analytics })
}
