import { MedusaContainer } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { ozonTrackingUrl } from "./ozon-delivery"
import { ensureMedusaShopNumber } from "./shop-order-number"

export const PAID_STORE_ORDER_FIELDS = [
  "id",
  "display_id",
  "email",
  "status",
  "total",
  "currency_code",
  "metadata",
  "cart_id",
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
]

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

export function presentPaidStoreOrder(order: Record<string, unknown>) {
  const metadata = (order.metadata || {}) as Record<string, unknown>
  const address = (order.shipping_address || {}) as Record<string, unknown>
  const orderNumber = metadata.ozon_order_number
    ? String(metadata.ozon_order_number)
    : null
  return {
    order_id: String(order.id || ""),
    display_id: order.display_id ?? null,
    shop_number: metadata.shop_number ? String(metadata.shop_number) : null,
    email: order.email ? String(order.email) : null,
    status: order.status || null,
    total: money(order.total),
    currency_code: order.currency_code || "rub",
    ozon_order_number: orderNumber,
    ozon_posting_number: metadata.ozon_posting_number
      ? String(metadata.ozon_posting_number)
      : null,
    ozon_tracking: metadata.ozon_tracking
      ? String(metadata.ozon_tracking)
      : ozonTrackingUrl(orderNumber),
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
  }
}

export async function loadPaidStoreOrderByCartId(
  container: MedusaContainer,
  cartId: string
) {
  const id = String(cartId || "").trim()
  if (!id) return null
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "order",
    fields: PAID_STORE_ORDER_FIELDS,
    filters: { cart_id: id },
  })
  const order = ((data ?? [])[0] || null) as Record<string, unknown> | null
  if (!order?.id) return null
  const metadata = (order.metadata || {}) as Record<string, unknown>
  if (!metadata.shop_number) {
    const number = await ensureMedusaShopNumber(container, String(order.id))
    if (number) metadata.shop_number = number
  }
  return presentPaidStoreOrder({ ...order, metadata })
}
