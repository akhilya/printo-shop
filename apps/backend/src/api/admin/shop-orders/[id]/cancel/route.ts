import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { cancelShopOrder, errorText, parseShopOrderCancel } from "../../../../../lib/shop-order"

export async function POST(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) {
  const parsed = parseShopOrderCancel(req.body)
  if ("error" in parsed) {
    res.status(400).json({ success: false, message: parsed.error })
    return
  }
  try {
    const result = await cancelShopOrder(req.scope, req.params.id, parsed)
    res.json({ success: true, ...result })
  } catch (error) {
    res.status(400).json({
      success: false,
      message: errorText(error),
    })
  }
}
