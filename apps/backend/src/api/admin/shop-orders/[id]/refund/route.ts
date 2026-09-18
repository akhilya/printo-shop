import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { errorText, parseShopOrderRefund, refundShopOrder } from "../../../../../lib/shop-order"

export async function POST(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) {
  const parsed = parseShopOrderRefund(req.body)
  try {
    const result = await refundShopOrder(req.scope, req.params.id, parsed.note)
    res.json({ success: true, ...result })
  } catch (error) {
    res.status(400).json({
      success: false,
      message: errorText(error),
    })
  }
}
