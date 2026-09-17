import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { loadPaidStoreOrderByCartId } from "../../../lib/checkout-order"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const cartId = String(req.query.cart_id || "").trim()
  if (!cartId) {
    res.status(400).json({ message: "Не удалось найти заказ." })
    return
  }
  const order = await loadPaidStoreOrderByCartId(req.scope, cartId)
  if (!order) {
    res.status(404).json({ message: "Не удалось найти заказ." })
    return
  }
  res.json(order)
}
