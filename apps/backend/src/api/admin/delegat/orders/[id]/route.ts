import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { getDelegatOrder } from "../../../../../lib/delegat-bridge/orders"

export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) {
  const order = await getDelegatOrder(req.scope, req.params.id)
  if (!order) {
    res.status(404).json({ success: false, error: "order_not_found" })
    return
  }
  res.json({ success: true, order })
}
