import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import {
  applyCustomOrderPromo,
  removeCustomOrderPromo,
} from "../../../../../lib/custom-order-pay"

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const code = String(
    (req.body as { code?: string } | undefined)?.code || ""
  )
  try {
    const checkout = await applyCustomOrderPromo(
      req.scope,
      String(req.params.token || ""),
      code
    )
    res.json({ checkout })
  } catch (error) {
    const status =
      error instanceof MedusaError && error.type === MedusaError.Types.NOT_FOUND
        ? 404
        : 400
    res.status(status).json({
      message: error instanceof Error ? error.message : "promo_failed",
    })
  }
}

export async function DELETE(req: MedusaRequest, res: MedusaResponse) {
  try {
    const checkout = await removeCustomOrderPromo(
      req.scope,
      String(req.params.token || "")
    )
    res.json({ checkout })
  } catch (error) {
    const status =
      error instanceof MedusaError && error.type === MedusaError.Types.NOT_FOUND
        ? 404
        : 400
    res.status(status).json({
      message: error instanceof Error ? error.message : "promo_failed",
    })
  }
}
