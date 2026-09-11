import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { getDelegatOrder } from "../../../../../../lib/delegat-bridge/orders"
import { applyShopOrderAction } from "../../../../../../lib/shop-fulfillment"

export async function POST(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) {
  const action = String(
    (req.body as { action?: string } | undefined)?.action || ""
  )
  try {
    await applyShopOrderAction(req.scope, req.params.id, action)
    const order = await getDelegatOrder(req.scope, req.params.id)
    res.json({ success: true, order })
  } catch (error) {
    const status =
      error instanceof MedusaError && error.type === MedusaError.Types.NOT_FOUND
        ? 404
        : 400
    res.status(status).json({
      success: false,
      error: error instanceof Error ? error.message : "status_failed",
    })
  }
}
