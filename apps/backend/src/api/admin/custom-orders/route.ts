import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { presentCustomOrder } from "../../../lib/custom-order"
import { CUSTOM_ORDER_MODULE } from "../../../modules/custom-order"
import type CustomOrderModuleService from "../../../modules/custom-order/service"

export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) {
  const q = String(req.query.q || "").trim()
  const status = String(req.query.status || "").trim()
  const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100)
  const offset = Math.max(Number(req.query.offset) || 0, 0)
  const filters: Record<string, unknown> = {}
  if (status) filters.status = status
  if (q) {
    filters.$or = [
      { name: { $ilike: `%${q}%` } },
      { email: { $ilike: `%${q}%` } },
      { phone: { $ilike: `%${q}%` } },
      { telegram: { $ilike: `%${q}%` } },
      { max_account: { $ilike: `%${q}%` } },
      { vk: { $ilike: `%${q}%` } },
      { message: { $ilike: `%${q}%` } },
      { product_title: { $ilike: `%${q}%` } },
    ]
  }
  const service: CustomOrderModuleService = req.scope.resolve(CUSTOM_ORDER_MODULE)
  const [rows, count] = await service.listAndCountCustomOrders(filters, {
    order: { created_at: "DESC" },
    take: limit,
    skip: offset,
  })
  res.json({
    orders: rows.map((row) =>
      presentCustomOrder(row as unknown as Record<string, unknown>)
    ),
    count,
    limit,
    offset,
  })
}
