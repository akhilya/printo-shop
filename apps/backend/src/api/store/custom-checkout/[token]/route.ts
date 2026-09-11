import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import { presentPublicCustomCheckout } from "../../../../lib/custom-order"
import { findCustomOrderByToken } from "../../../../lib/custom-order-pay"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const token = String(req.params.token || "")
  const order = await findCustomOrderByToken(req.scope, token)
  if (!order || order.quote_amount == null || !order.checkout_token) {
    res.status(404).json({ message: "Страница не найдена" })
    return
  }
  let product: {
    title?: string | null
    handle?: string | null
    thumbnail?: string | null
  } | null = null
  const productId = String(order.product_id || "").trim()
  if (productId) {
    try {
      const productModule = req.scope.resolve(Modules.PRODUCT) as {
        retrieveProduct: (
          id: string,
          config?: { select?: string[] }
        ) => Promise<{
          title?: string | null
          handle?: string | null
          thumbnail?: string | null
        }>
      }
      product = await productModule.retrieveProduct(productId, {
        select: ["id", "title", "handle", "thumbnail"],
      })
    } catch {
      product = null
    }
  }
  res.json({ checkout: presentPublicCustomCheckout(order, product) })
}
