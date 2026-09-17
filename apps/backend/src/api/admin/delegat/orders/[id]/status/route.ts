import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { getDelegatOrder } from "../../../../../../lib/delegat-bridge/orders"
import { applyShopOrderAction } from "../../../../../../lib/shop-fulfillment"
import { errorText, parseShopOrderCancel } from "../../../../../../lib/shop-order"

export async function POST(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) {
  const action = String(
    (req.body as { action?: string } | undefined)?.action || ""
  )
  try {
    if (action === "cancel") {
      const parsed = parseShopOrderCancel(req.body)
      if ("error" in parsed) {
        res.status(400).json({ success: false, error: parsed.error })
        return
      }
      await applyShopOrderAction(req.scope, req.params.id, action, parsed)
    } else {
      await applyShopOrderAction(req.scope, req.params.id, action)
    }
    const order = await getDelegatOrder(req.scope, req.params.id)
    res.json({ success: true, order })
  } catch (error) {
    const status =
      error instanceof MedusaError && error.type === MedusaError.Types.NOT_FOUND
        ? 404
        : 400
    res.status(status).json({
      success: false,
      error: errorText(error, "status_failed"),
    })
  }
}
