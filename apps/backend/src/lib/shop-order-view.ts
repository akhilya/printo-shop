import { shopOrderUrl } from "./custom-order"
import { ozonTrackingUrl } from "./ozon-delivery"

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

export function customerOrderStatus(input: {
  source: "order" | "custom"
  status?: string | null
  paid?: boolean
  fulfillment?: string | null
}) {
  if (input.source === "custom") {
    if (input.status === "closed") {
      return { code: "closed", label: "Закрыт" }
    }
    if (input.paid) {
      if (input.fulfillment === "delivered") {
        return { code: "delivered", label: "Доставлен" }
      }
      if (input.fulfillment === "delivering") {
        return { code: "delivering", label: "Доставляется" }
      }
      return { code: "packing", label: "В сборке" }
    }
    if (input.status === "quoted") {
      return { code: "awaiting_payment", label: "Ожидает оплату" }
    }
    if (input.status === "in_progress") {
      return { code: "in_progress", label: "В работе" }
    }
    return { code: "new", label: "Заявка" }
  }
  if (input.status === "canceled") {
    return { code: "canceled", label: "Отменён" }
  }
  if (input.status === "archived" || input.fulfillment === "delivered") {
    return { code: "delivered", label: "Доставлен" }
  }
  if (input.fulfillment === "delivering") {
    return { code: "delivering", label: "Доставляется" }
  }
  if (input.status === "completed") {
    return { code: "packing", label: "В сборке" }
  }
  return { code: "awaiting_payment", label: "Ожидает оплату" }
}

export function presentShopOrderFromMedusa(
  order: Record<string, unknown>,
  number: string
) {
  const metadata = (order.metadata || {}) as Record<string, unknown>
  const address = (order.shipping_address || {}) as Record<string, unknown>
  const ozonNumber = metadata.ozon_order_number
    ? String(metadata.ozon_order_number)
    : null
  const status = customerOrderStatus({
    source: "order",
    status: String(order.status || ""),
    fulfillment: metadata.shop_fulfillment
      ? String(metadata.shop_fulfillment)
      : null,
  })
  return {
    number,
    url: shopOrderUrl(number),
    source: "order" as const,
    status,
    paid:
      status.code === "packing" ||
      status.code === "delivering" ||
      status.code === "delivered",
    email: order.email ? String(order.email) : null,
    total: money(order.total),
    currency_code: String(order.currency_code || "rub"),
    created_at: order.created_at ? String(order.created_at) : null,
    details: null as string | null,
    image_urls: [] as string[],
    ozon_order_number: ozonNumber,
    ozon_posting_number: metadata.ozon_posting_number
      ? String(metadata.ozon_posting_number)
      : null,
    ozon_tracking:
      metadata.ozon_tracking
        ? String(metadata.ozon_tracking)
        : ozonTrackingUrl(ozonNumber),
    ozon_point_name:
      (metadata.ozon_point_name && String(metadata.ozon_point_name)) ||
      (address.address_2 && String(address.address_2)) ||
      null,
    ozon_point_address:
      (metadata.ozon_point_address && String(metadata.ozon_point_address)) ||
      (address.address_1 && String(address.address_1)) ||
      null,
    city: address.city ? String(address.city) : null,
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

export function presentShopOrderFromCustom(
  order: Record<string, unknown>,
  number: string,
  product?: {
    title?: string | null
    thumbnail?: string | null
  } | null
) {
  const paid = Boolean(order.paid_at)
  const title =
    (product?.title && String(product.title)) ||
    (order.product_title && String(order.product_title)) ||
    "Индивидуальный заказ"
  const urls = Array.isArray(order.image_urls)
    ? order.image_urls.filter(
        (url): url is string => typeof url === "string" && Boolean(url)
      )
    : []
  const note = String(order.quote_note || order.message || "").trim() || null
  return {
    number,
    url: shopOrderUrl(number),
    source: "custom" as const,
    status: customerOrderStatus({
      source: "custom",
      status: String(order.status || ""),
      paid,
    }),
    paid,
    email: order.email ? String(order.email) : null,
    total:
      typeof order.quote_amount === "number"
        ? order.quote_amount
        : Number(order.quote_amount) || null,
    currency_code: "rub",
    created_at: order.created_at ? String(order.created_at) : null,
    details: note,
    image_urls: urls,
    ozon_order_number: order.ozon_order_number
      ? String(order.ozon_order_number)
      : null,
    ozon_posting_number: order.ozon_posting_number
      ? String(order.ozon_posting_number)
      : null,
    ozon_tracking: order.ozon_tracking ? String(order.ozon_tracking) : null,
    ozon_point_name: order.ozon_point_name
      ? String(order.ozon_point_name)
      : null,
    ozon_point_address: order.ozon_point_address
      ? String(order.ozon_point_address)
      : null,
    city: null as string | null,
    items: [
      {
        title,
        quantity: 1,
        sku: null as string | null,
        thumbnail: product?.thumbnail || urls[0] || null,
        unit_price:
          typeof order.quote_amount === "number"
            ? order.quote_amount
            : Number(order.quote_amount) || null,
      },
    ],
  }
}
