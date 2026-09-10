import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { getProduct } from "../../../../../lib/delegat-bridge/service"

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const product = await getProduct(req.scope, req.params.id)
  if (!product) {
    res.status(404).json({ success: false, error: "product_not_found" })
    return
  }
  res.json(product)
}
