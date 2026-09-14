import { MedusaContainer } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import {
  mapDelegatOrderStatus,
  mapMedusaOrderStatus,
  shopFulfillmentOf,
} from "../shop-fulfillment-status"

export { mapMedusaOrderStatus }

const ORDER_FIELDS = [
  "id",
  "display_id",
  "status",
  "email",
  "currency_code",
  "created_at",
  "updated_at",
  "summary.*",
  "items.id",
  "items.title",
  "items.thumbnail",
  "items.quantity",
  "items.unit_price",
  "items.variant.sku",
  "items.variant.title",
  "items.variant.product_id",
  "items.variant.product.title",
  "shipping_address.first_name",
  "shipping_address.last_name",
  "shipping_address.phone",
  "shipping_address.address_1",
  "shipping_address.address_2",
  "shipping_address.city",
  "shipping_address.postal_code",
  "metadata",
  "fulfillments.id",
  "fulfillments.canceled_at",
  "fulfillments.shipped_at",
  "fulfillments.delivered_at",
  "payment_collections.status",
  "payment_collections.payments.captured_at",
  "payment_collections.payments.captures.id",
]

function money(value: unknown): number | null {
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

export function presentDelegatOrder(order: Record<string, unknown>) {
  const address = (order.shipping_address || {}) as Record<string, unknown>
  const metadata = (order.metadata || {}) as Record<string, unknown>
  const name = [address.first_name, address.last_name].filter(Boolean).join(" ").trim()
  const pvz = [metadata.ozon_point_name, address.address_2]
    .map((value) => String(value || "").trim())
    .find(Boolean)
  const street = [
    pvz ? `Ozon ПВЗ: ${pvz}` : "",
    metadata.ozon_point_address || address.address_1,
    address.city,
    address.postal_code,
  ]
    .filter(Boolean)
    .join(", ")
  const summary = (order.summary || {}) as Record<string, unknown>
  const items = ((order.items as Array<Record<string, unknown>>) || []).map((item) => {
    const variant = (item.variant || {}) as Record<string, unknown>
    const product = (variant.product || {}) as Record<string, unknown>
    const title = String(product.title || item.title || "").trim()
    const variantTitle = String(variant.title || "").trim()
    const sku = String(variant.sku || "").trim()
    const name = [title, variantTitle && variantTitle.toLowerCase() !== "default" ? variantTitle : "", sku]
      .filter(Boolean)
      .join(" · ")
    return {
      external_product_id: String(variant.product_id || ""),
      sku,
      name: name || "Товар",
      quantity: Number(item.quantity || 0),
      price: money(item.unit_price),
      image_url: item.thumbnail ? String(item.thumbnail) : null,
    }
  })
  const comment = items
    .map((item) =>
      item.quantity > 1 ? `${item.name} ×${item.quantity}` : item.name
    )
    .join(", ")
  const fulfillment = mapDelegatOrderStatus(order)
  const hasLabel = Boolean(
    metadata.ozon_label_url ||
      (metadata.ozon_posting_number &&
        (fulfillment === "awaiting_deliver" ||
          fulfillment === "delivering" ||
          fulfillment === "delivered"))
  )
  return {
    external_id: String(order.id || ""),
    display_id: metadata.shop_number
      ? String(metadata.shop_number)
      : order.display_id != null
        ? String(order.display_id)
        : null,
    status: fulfillment,
    raw_status: [
      String(order.status || ""),
      shopFulfillmentOf(order),
      metadata.ozon_posting_status,
    ]
      .filter(Boolean)
      .join(":"),
    channel: "shop",
    has_label: hasLabel,
    ozon_posting_number: metadata.ozon_posting_number
      ? String(metadata.ozon_posting_number)
      : null,
    ozon_tracking: metadata.ozon_tracking
      ? String(metadata.ozon_tracking)
      : null,
    created_at: order.created_at || null,
    updated_at: order.updated_at || null,
    currency: String(order.currency_code || "rub").toUpperCase(),
    total: money(summary.current_order_total ?? summary.original_order_total),
    customer_email: order.email ? String(order.email) : null,
    customer_name: name || null,
    customer_phone: address.phone ? String(address.phone) : null,
    shipping_address: street || null,
    comment: comment || null,
    items,
  }
}

export async function listDelegatOrders(
  container: MedusaContainer,
  query: { page?: number; pageSize?: number; status?: string; search?: string }
) {
  const page = Math.max(Number(query.page) || 1, 1)
  const pageSize = Math.min(Math.max(Number(query.pageSize) || 50, 1), 100)
  const remote = container.resolve(ContainerRegistrationKeys.QUERY)
  const filters: Record<string, unknown> = {}
  if (query.status === "cancelled") filters.status = "canceled"
  else if (query.status === "delivered") filters.status = "archived"
  else if (
    query.status === "awaiting_pack" ||
    query.status === "awaiting_deliver" ||
    query.status === "delivering" ||
    query.status === "returned"
  ) {
    filters.status = ["completed", "pending"]
  } else if (query.status === "unpaid") filters.status = "pending"
  const { data, metadata } = await remote.graph({
    entity: "order",
    fields: ORDER_FIELDS,
    filters: Object.keys(filters).length ? filters : undefined,
    pagination: { skip: (page - 1) * pageSize, take: pageSize },
  })
  let items = ((data ?? []) as Array<Record<string, unknown>>).map(presentDelegatOrder)
  if (
    query.status === "delivering" ||
    query.status === "awaiting_pack" ||
    query.status === "awaiting_deliver" ||
    query.status === "returned" ||
    query.status === "unpaid"
  ) {
    items = items.filter((item) => item.status === query.status)
  }
  const search = String(query.search || "").trim().toLowerCase()
  if (search) {
    items = items.filter((item) =>
      [item.external_id, item.display_id, item.customer_email, item.customer_name]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(search))
    )
  }
  const count = Number(metadata?.count ?? items.length)
  return {
    success: true,
    items,
    has_more: page * pageSize < count,
  }
}

export async function getDelegatOrder(container: MedusaContainer, id: string) {
  const remote = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await remote.graph({
    entity: "order",
    fields: ORDER_FIELDS,
    filters: { id },
  })
  const order = (data ?? [])[0] as Record<string, unknown> | undefined
  if (!order) return null
  return presentDelegatOrder(order)
}
