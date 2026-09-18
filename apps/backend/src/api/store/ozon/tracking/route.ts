import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import {
  PAID_STORE_ORDER_FIELDS,
  presentPaidStoreOrder,
} from "../../../../lib/checkout-order"
import { ensureMedusaShopNumber, ensureShopAccessToken } from "../../../../lib/shop-order-number"

function emailsMatch(left: unknown, right: string) {
  return String(left || "").trim().toLowerCase() === right
}

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const orderId = String(req.query.order_id || "").trim()
  const email = String(req.query.email || "").trim().toLowerCase()
  if (!orderId || !email) {
    res.status(400).json({ message: "Не удалось найти заказ." })
    return
  }
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "order",
    fields: PAID_STORE_ORDER_FIELDS,
    filters: { id: orderId },
  })
  const order = ((data ?? [])[0] || null) as Record<string, unknown> | null
  if (!order || !emailsMatch(order.email, email)) {
    res.status(404).json({ message: "Не удалось найти заказ." })
    return
  }
  const metadata = (order.metadata || {}) as Record<string, unknown>
  if (!metadata.shop_number) {
    const number = await ensureMedusaShopNumber(req.scope, String(order.id))
    if (number) metadata.shop_number = number
  }
  const token = metadata.shop_number
    ? await ensureShopAccessToken(req.scope, String(metadata.shop_number))
    : null
  if (token) metadata.shop_access_token = token
  res.json(presentPaidStoreOrder({ ...order, metadata }))
}
