import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { confirmCustomOrderPayment } from "../../../../../lib/custom-order-pay"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  try {
    const checkout = await confirmCustomOrderPayment(
      req.scope,
      String(req.params.token || "")
    )
    res.json({ checkout })
  } catch (error) {
    if (error instanceof MedusaError && error.type === MedusaError.Types.NOT_FOUND) {
      res.status(404).json({ message: "Страница не найдена" })
      return
    }
    res.status(400).json({ message: "Не удалось проверить оплату" })
  }
}
