import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { ozonTrackingUrl } from "../../../../lib/ozon-delivery"
import { ensureMedusaShopNumber } from "../../../../lib/shop-order-number"

function money(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (value && typeof value === "object") {
    const rec = value as { numeric?: unknown; value?: unknown }
    if (typeof rec.numeric === "number") return rec.numeric
    const fromValue = Number(rec.value)
    if (Number.isFinite(fromValue)) return fromValue
  }
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

function emailsMatch(left: unknown, right: string) {
  return String(left || "").trim().toLowerCase() === right
}

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const orderId = String(req.query.order_id || "").trim()
  const email = String(req.query.email || "").trim().toLowerCase()
  if (!orderId || !email) {
    res.status(400).json({ message: "order_id and email required" })
    return
  }
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "order",
    fields: [
      "id",
      "display_id",
      "email",
      "status",
      "total",
      "currency_code",
      "metadata",
      "items.title",
      "items.quantity",
      "items.unit_price",
      "items.thumbnail",
      "items.variant.sku",
      "shipping_address.first_name",
      "shipping_address.last_name",
      "shipping_address.phone",
      "shipping_address.address_1",
      "shipping_address.address_2",
      "shipping_address.city",
    ],
    filters: { id: orderId },
  })
  const order = ((data ?? [])[0] || null) as Record<string, unknown> | null
  if (!order || !emailsMatch(order.email, email)) {
    res.status(404).json({ message: "order_not_found" })
    return
  }
  const metadata = (order.metadata || {}) as Record<string, unknown>
  if (!metadata.shop_number) {
    const number = await ensureMedusaShopNumber(req.scope, String(order.id))
    if (number) metadata.shop_number = number
  }
  const address = (order.shipping_address || {}) as Record<string, unknown>
  const orderNumber = metadata.ozon_order_number
    ? String(metadata.ozon_order_number)
    : null
  res.json({
    order_id: order.id,
    display_id: order.display_id,
    shop_number: metadata.shop_number
      ? String(metadata.shop_number)
      : null,
    email: order.email || null,
    status: order.status,
    total: money(order.total),
    currency_code: order.currency_code || "rub",
    ozon_order_number: orderNumber,
    ozon_posting_number: metadata.ozon_posting_number || null,
    ozon_tracking:
      metadata.ozon_tracking || ozonTrackingUrl(orderNumber),
    ozon_create_error: metadata.ozon_create_error || null,
    ozon_point_name:
      metadata.ozon_point_name || address.address_2 || null,
    ozon_point_address:
      metadata.ozon_point_address || address.address_1 || null,
    city: address.city || null,
    items: ((order.items as Array<Record<string, unknown>>) || []).map(
      (item) => ({
        title: item.title,
        quantity: item.quantity,
        sku: (item.variant as Record<string, unknown> | undefined)?.sku,
        thumbnail: item.thumbnail || null,
        unit_price: money(item.unit_price),
      })
    ),
  })
}
