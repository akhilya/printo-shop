import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { applyShopOrderAction } from "../../../../../lib/shop-fulfillment"

export async function POST(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) {
  const action = String(
    (req.body as { action?: string } | undefined)?.action || ""
  )
  try {
    const result = await applyShopOrderAction(req.scope, req.params.id, action)
    res.json({ success: true, ...result })
  } catch (error) {
    const status =
      error instanceof MedusaError && error.type === MedusaError.Types.NOT_FOUND
        ? 404
        : 400
    res.status(status).json({
      success: false,
      message: error instanceof Error ? error.message : "status_failed",
    })
  }
}
