import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { importOzonReviewsFromShop } from "../../../../lib/ozon-reviews"

export async function POST(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) {
  const result = await importOzonReviewsFromShop(req.scope)
  res.json(result)
}
