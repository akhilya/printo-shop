import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { cancelShopOrder, errorText, parseShopOrderCancel } from "../../../../../../lib/shop-order"
import { getDelegatOrder } from "../../../../../../lib/delegat-bridge/orders"

export async function POST(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) {
  const parsed = parseShopOrderCancel(req.body)
  if ("error" in parsed) {
    res.status(400).json({ success: false, error: parsed.error })
    return
  }
  try {
    await cancelShopOrder(req.scope, req.params.id, parsed)
    const order = await getDelegatOrder(req.scope, req.params.id)
    res.json({ success: true, order })
  } catch (error) {
    res.status(400).json({
      success: false,
      error: errorText(error),
    })
  }
}
