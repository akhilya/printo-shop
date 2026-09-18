import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { loadShopOrderByNumber } from "../../../../lib/shop-order-lookup"
import { shopOrderQueryToken } from "../../../../lib/shop-order-number"
import { publicShopOrder } from "../../../../lib/shop-order-view"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const number = String(req.params.number || "").trim()
  const order = await loadShopOrderByNumber(
    req.scope,
    number,
    shopOrderQueryToken(req.query)
  )
  if (!order) {
    res.status(404).json({ message: "Заказ не найден." })
    return
  }
  res.json({ order: publicShopOrder(order) })
}
