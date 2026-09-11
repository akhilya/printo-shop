import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { cancelShopOrder, errorText } from "../../../../../../lib/shop-order"
import { getDelegatOrder } from "../../../../../../lib/delegat-bridge/orders"

export async function POST(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) {
  const refund = (req.body as { refund?: boolean } | undefined)?.refund !== false
  try {
    await cancelShopOrder(req.scope, req.params.id, refund)
    const order = await getDelegatOrder(req.scope, req.params.id)
    res.json({ success: true, order })
  } catch (error) {
    res.status(400).json({
      success: false,
      error: errorText(error),
    })
  }
}
