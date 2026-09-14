import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { presentShopEvent, shopEventSearchFilters } from "../../../lib/shop-event"
import { SHOP_EVENT_MODULE } from "../../../modules/shop-event"
import type ShopEventModuleService from "../../../modules/shop-event/service"

export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) {
  const q = String(req.query.q || "").trim()
  const kind = String(req.query.kind || "").trim()
  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 100)
  const offset = Math.max(Number(req.query.offset) || 0, 0)
  const filters: Record<string, unknown> = {
    ...shopEventSearchFilters(q),
  }
  if (kind) filters.kind = kind
  const service: ShopEventModuleService = req.scope.resolve(SHOP_EVENT_MODULE)
  const [rows, count] = await service.listAndCountShopEvents(filters, {
    order: { created_at: "DESC" },
    take: limit,
    skip: offset,
  })
  res.json({
    logs: rows.map((row) =>
      presentShopEvent(row as unknown as Record<string, unknown>)
    ),
    count,
    limit,
    offset,
  })
}
