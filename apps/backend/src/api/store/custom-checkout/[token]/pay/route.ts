import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { startCustomOrderPayment } from "../../../../../lib/custom-order-pay"

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  try {
    const result = await startCustomOrderPayment(
      req.scope,
      String(req.params.token || ""),
      req.body
    )
    res.json(result)
  } catch (error) {
    if (error instanceof MedusaError) {
      const status =
        error.type === MedusaError.Types.NOT_FOUND
          ? 404
          : error.type === MedusaError.Types.NOT_ALLOWED
            ? 409
            : 400
      res.status(status).json({ message: error.message })
      return
    }
    res.status(400).json({ message: "Не удалось создать платёж" })
  }
}
