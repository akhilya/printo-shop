import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { cancelShopOrder } from "../../../../../lib/shop-order"

export async function POST(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) {
  const refund = (req.body as { refund?: boolean } | undefined)?.refund !== false
  try {
    const result = await cancelShopOrder(req.scope, req.params.id, refund)
    res.json({ success: true, ...result })
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error instanceof Error ? error.message : "cancel_failed",
    })
  }
}
