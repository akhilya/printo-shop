import { shopOrderUrl } from "./custom-order"
import { ozonTrackingUrl } from "./ozon-delivery"
import {
  orderIsCanceled,
  orderLooksPaid,
  shopFulfillmentOf,
} from "./shop-fulfillment-status"

function money(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (value && typeof value === "object") {
    const rec = value as { numeric?: unknown; value?: unknown; amount?: unknown }
    if (typeof rec.numeric === "number" && Number.isFinite(rec.numeric)) {
      return rec.numeric
    }
    return money(rec.value ?? rec.amount)
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
  const orderStatus = String(input.status || "").toLowerCase()
  if (orderStatus === "canceled" || orderStatus === "cancelled") {
    return { code: "canceled", label: "Отменён" }
  }
  if (input.fulfillment === "returned") {
    return { code: "returned", label: "Возврат" }
  }
  if (input.status === "archived" || input.fulfillment === "delivered") {
    return { code: "delivered", label: "Доставлен" }
  }
  if (input.fulfillment === "delivering") {
    return { code: "delivering", label: "Доставляется" }
  }
  if (input.fulfillment === "awaiting_deliver") {
    return { code: "ready_to_ship", label: "Собран" }
  }
  if (input.status === "completed" || input.paid) {
    return { code: "packing", label: "В сборке" }
  }
  return { code: "awaiting_payment", label: "Ожидает оплату" }
}

export function shopLineHandle(item: Record<string, unknown>) {
  const variant = (item.variant || {}) as Record<string, unknown>
  const product = (variant.product || item.product || {}) as Record<string, unknown>
  const handle = String(item.product_handle || item.handle || product.handle || "").trim()
  return handle || null
}

export function shopLineAmounts(item: Record<string, unknown>) {
  const quantity = Math.max(1, Number(item.quantity) || 1)
  const fromLine = money(item.total ?? item.subtotal)
  const fromUnit = money(item.unit_price)
  const total =
    fromLine != null && fromLine > 0
      ? fromLine
      : fromUnit != null
        ? fromUnit * quantity
        : null
  const unit_price = total != null ? total / quantity : fromUnit
  return { quantity, unit_price, total }
}

export function shopOrderShipping(order: Record<string, unknown>) {
  const metadata = (order.metadata || {}) as Record<string, unknown>
  return (
    money(metadata.ozon_shipping_amount) ??
    money(order.shipping_total) ??
    money(order.quote_shipping_amount)
  )
}

export function shopOrderCanMessage(statusCode: unknown) {
  const code = String(statusCode || "")
  return code === "delivered" || code === "returned"
}

export function presentShopOrderFromMedusa(
  order: Record<string, unknown>,
  number: string,
  accessToken?: string | null
) {
  const metadata = (order.metadata || {}) as Record<string, unknown>
  const address = (order.shipping_address || {}) as Record<string, unknown>
  const ozonNumber = metadata.ozon_order_number
    ? String(metadata.ozon_order_number)
    : null
  const status = customerOrderStatus({
    source: "order",
    status: orderIsCanceled(order) ? "canceled" : String(order.status || ""),
    paid: orderLooksPaid(order),
    fulfillment: shopFulfillmentOf(order),
  })
  const cancelReason = String(metadata.cancel_reason || "").trim()
  const cancelNote = String(metadata.cancel_note || "").trim()
  return {
    number,
    url: shopOrderUrl(number, process.env, accessToken),
    source: "order" as const,
    status,
    can_message: shopOrderCanMessage(status.code),
    cancel_reason: status.code === "canceled" && cancelReason ? cancelReason : null,
    cancel_note: status.code === "canceled" && cancelNote ? cancelNote : null,
    paid:
      status.code === "packing" ||
      status.code === "ready_to_ship" ||
      status.code === "delivering" ||
      status.code === "delivered" ||
      status.code === "returned",
    email: order.email ? String(order.email) : null,
    total: money(order.total),
    shipping: shopOrderShipping(order),
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
    ozon_label_url: metadata.ozon_label_url
      ? String(metadata.ozon_label_url)
      : null,
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
      (item) => {
        const amounts = shopLineAmounts(item)
        return {
          title: item.title,
          quantity: amounts.quantity,
          sku: (item.variant as Record<string, unknown> | undefined)?.sku,
          handle: shopLineHandle(item),
          thumbnail: item.thumbnail || null,
          unit_price: amounts.unit_price,
          total: amounts.total,
        }
      }
    ),
  }
}

export function publicShopOrder(order: {
  number?: unknown
  source?: unknown
  status?: unknown
  can_message?: unknown
  cancel_reason?: unknown
  cancel_note?: unknown
  paid?: unknown
  total?: unknown
  shipping?: unknown
  currency_code?: unknown
  ozon_tracking?: unknown
  ozon_point_name?: unknown
  items?: Array<{
    title?: unknown
    quantity?: unknown
    handle?: unknown
    thumbnail?: unknown
    unit_price?: unknown
    total?: unknown
  }>
  gift_card_amount?: unknown
  gift_card_code?: unknown
}) {
  return {
    number: order.number,
    source: order.source,
    status: order.status,
    can_message: order.can_message,
    cancel_reason: order.cancel_reason ?? null,
    cancel_note: order.cancel_note ?? null,
    paid: order.paid,
    total: order.total,
    shipping: order.shipping ?? null,
    currency_code: order.currency_code,
    can_track: Boolean(order.ozon_tracking),
    gift_card_amount: order.gift_card_amount ?? null,
    gift_card_code: order.gift_card_code ?? null,
    ozon_point_name: order.ozon_point_name || null,
    items: (order.items || []).map((item) => ({
      title: item.title,
      quantity: item.quantity,
      handle: item.handle || null,
      thumbnail: item.thumbnail || null,
      unit_price: item.unit_price,
      total: item.total,
    })),
  }
}

export function presentShopOrderFromCustom(
  order: Record<string, unknown>,
  number: string,
  product?: {
    title?: string | null
    thumbnail?: string | null
    handle?: string | null
  } | null,
  accessToken?: string | null
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
  const status = customerOrderStatus({
    source: "custom",
    status: String(order.status || ""),
    paid,
  })
  const total = money(order.quote_amount)
  const shipping = shopOrderShipping(order)
  const itemTotal =
    total != null
      ? Math.max(0, total - (shipping && shipping > 0 ? shipping : 0))
      : null
  return {
    number,
    url: shopOrderUrl(number, process.env, accessToken),
    source: "custom" as const,
    status,
    can_message: shopOrderCanMessage(status.code),
    cancel_reason: null as string | null,
    cancel_note: null as string | null,
    paid,
    email: order.email ? String(order.email) : null,
    total,
    shipping,
    currency_code: "rub",
    created_at: order.created_at ? String(order.created_at) : null,
    details: note,
    gift_card_amount: money(order.gift_card_amount),
    gift_card_code: paid ? String(order.gift_card_code || "") || null : null,
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
        handle: product?.handle ? String(product.handle) : null,
        thumbnail: product?.thumbnail || urls[0] || null,
        unit_price: itemTotal,
        total: itemTotal,
      },
    ],
  }
}
