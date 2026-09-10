import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { withProductTitles } from "../../../lib/review-admin"
import { REVIEW_MODULE } from "../../../modules/reviews"
import type ReviewModuleService from "../../../modules/reviews/service"

export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) {
  const productId = String(req.query.product_id || "").trim()
  const status = String(req.query.status || "").trim()
  const q = String(req.query.q || "").trim()
  const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100)
  const offset = Math.max(Number(req.query.offset) || 0, 0)

  const filters: Record<string, unknown> = {}
  if (productId) filters.product_id = productId
  if (status === "moderation" || status === "published") filters.status = status
  if (q) {
    filters.$or = [
      { author: { $ilike: `%${q}%` } },
      { body: { $ilike: `%${q}%` } },
      { ip: { $ilike: `%${q}%` } },
    ]
  }

  const service: ReviewModuleService = req.scope.resolve(REVIEW_MODULE)
  const [rows, count] = await service.listAndCountReviews(filters, {
    order: { created_at: "DESC" },
    take: limit,
    skip: offset,
  })
  const reviews = await withProductTitles(
    req.scope,
    rows as unknown as Record<string, unknown>[]
  )
  res.json({ reviews, count, limit, offset })
}
