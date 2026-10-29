export const CUSTOM_ORDER_STATUSES = [
  "new",
  "in_progress",
  "quoted",
  "paid",
  "closed",
] as const
export type CustomOrderStatus = (typeof CUSTOM_ORDER_STATUSES)[number]

export const CUSTOM_ORDER_DELIVERY = ["ozon"] as const
export type CustomOrderDelivery = (typeof CUSTOM_ORDER_DELIVERY)[number]

export const MAX_CUSTOM_ORDER_IMAGES = 6
export const MAX_CUSTOM_ORDER_IMAGE_BYTES = 2 * 1024 * 1024
export const MAX_CUSTOM_ORDER_NAME = 80
export const MAX_CUSTOM_ORDER_CONTACT = 80
export const MAX_CUSTOM_ORDER_MESSAGE = 4000

export const CUSTOM_ORDER_CONTACT_CHANNELS = ["telegram", "max"] as const
export type CustomOrderContactChannel =
  (typeof CUSTOM_ORDER_CONTACT_CHANNELS)[number]

export function customOrderChannelsFromRow(
  row: Record<string, unknown> | null | undefined
): CustomOrderContactChannel[] {
  const channels: CustomOrderContactChannel[] = []
  if (!row || row.custom_order_telegram !== false) channels.push("telegram")
  if (!row || row.custom_order_max !== false) channels.push("max")
  return channels
}

export function parseCustomOrderChannels(value: unknown): {
  telegram: boolean
  max: boolean
} {
  const list = Array.isArray(value) ? value : []
  const ids = new Set(list.map((item) => String(item || "").trim()))
  return {
    telegram: ids.has("telegram"),
    max: ids.has("max"),
  }
}

export type ParsedCustomOrder = {
  name: string
  email: string | null
  phone: string | null
  telegram: string | null
  max_account: string | null
  vk: string | null
  message: string
  product_id: string | null
  images: string[]
}

function clip(value: unknown, max: number): string {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max)
}

export function parseCustomOrderInput(
  body: unknown,
  opts: { channels?: readonly CustomOrderContactChannel[] } = {}
): ParsedCustomOrder | { error: string } {
  const rec =
    body && typeof body === "object" ? (body as Record<string, unknown>) : {}
  const channels = opts.channels ?? CUSTOM_ORDER_CONTACT_CHANNELS
  const name = clip(rec.name, MAX_CUSTOM_ORDER_NAME)
  const email = clip(rec.email, MAX_CUSTOM_ORDER_CONTACT)
  const phone = clip(rec.phone, MAX_CUSTOM_ORDER_CONTACT)
  const telegramRaw = clip(rec.telegram, MAX_CUSTOM_ORDER_CONTACT)
  const maxRaw = clip(rec.max_account ?? rec.max, MAX_CUSTOM_ORDER_CONTACT)
  const vk = clip(rec.vk, MAX_CUSTOM_ORDER_CONTACT)
  const telegram = channels.includes("telegram") ? telegramRaw : ""
  const maxAccount = channels.includes("max") ? maxRaw : ""
  const message = String(rec.message || rec.body || "").trim().slice(
    0,
    MAX_CUSTOM_ORDER_MESSAGE
  )
  if (!name || !message) {
    return { error: "Введите имя и описание заказа" }
  }
  if (!telegram && !maxAccount) {
    if (email || phone || vk || telegramRaw || maxRaw) {
      return { error: "Этот способ связи сейчас недоступен" }
    }
    return { error: "Укажите хотя бы один способ связи" }
  }

  const list = Array.isArray(rec.images) ? rec.images : []
  if (list.length > MAX_CUSTOM_ORDER_IMAGES) {
    return {
      error: `Можно прикрепить не больше ${MAX_CUSTOM_ORDER_IMAGES} фото`,
    }
  }
  const images: string[] = []
  for (const item of list) {
    const content =
      item && typeof item === "object"
        ? (item as { content?: unknown }).content
        : null
    if (typeof content !== "string" || !content.trim()) continue
    if (content.length > MAX_CUSTOM_ORDER_IMAGE_BYTES * 2) {
      return { error: "Фото больше 2 МБ" }
    }
    images.push(content)
  }

  return {
    name,
    email: null,
    phone: null,
    telegram: telegram || null,
    max_account: maxAccount || null,
    vk: null,
    message,
    product_id: clip(rec.product_id, 64) || null,
    images,
  }
}

export function storefrontOrigin(env: NodeJS.ProcessEnv = process.env) {
  const raw = String(env.STORE_CORS || "")
    .split(",")[0]
    .trim()
    .replace(/\/$/, "")
  return /^https?:\/\//i.test(raw) ? raw : "http://localhost:8000"
}

export function customOrderCheckoutUrl(
  token?: string | null,
  env: NodeJS.ProcessEnv = process.env
) {
  const value = String(token || "").trim()
  if (!value) return null
  return `${storefrontOrigin(env)}/custom-order/pay/${encodeURIComponent(value)}`
}

export function shopReturnsUrl(env: NodeJS.ProcessEnv = process.env) {
  return `${storefrontOrigin(env)}/returns`
}

export function shopLogoUrl(env: NodeJS.ProcessEnv = process.env) {
  return `${storefrontOrigin(env)}/logo-wide.webp`
}

export function shopOrderUrl(
  number?: string | null,
  env: NodeJS.ProcessEnv = process.env,
  token?: string | null
) {
  const value = String(number || "").trim()
  if (!/^\d{10}$/.test(value)) return null
  const access = String(token || "").trim()
  const path = `${storefrontOrigin(env)}/order/${value}`
  return access ? `${path}?t=${encodeURIComponent(access)}` : path
}

export type ParsedCustomOrderQuote = {
  quote_amount: number
  quote_items_amount: number
  quote_discount_amount: number
  quote_shipping_amount: number
  quote_other_amount: number
  quote_note: string | null
  delivery_method: CustomOrderDelivery | null
  client_picks_pvz: boolean
  pay_on_arrival: boolean
}

function moneyField(value: unknown, fallback = 0) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric < 0) return fallback
  return Math.round(numeric)
}

export function customQuoteTotal(parts: {
  items: number
  discount: number
  shipping: number
  other: number
  promo?: number
}) {
  return Math.max(
    0,
    parts.items -
      parts.discount -
      (parts.promo || 0) +
      parts.shipping +
      parts.other
  )
}

export function parseCustomOrderQuote(
  body: unknown
): ParsedCustomOrderQuote | { error: string } {
  const rec =
    body && typeof body === "object" ? (body as Record<string, unknown>) : {}
  const items = moneyField(
    rec.quote_items_amount ?? rec.quote_amount,
    Number.NaN
  )
  if (!Number.isFinite(items) || items < 1 || items > 10_000_000) {
    return { error: "Укажите цену товаров в рублях" }
  }
  const discount = moneyField(rec.quote_discount_amount)
  const shipping = moneyField(rec.quote_shipping_amount)
  const other = moneyField(rec.quote_other_amount)
  const total = customQuoteTotal({ items, discount, shipping, other })
  if (total < 1) {
    return { error: "Итого должно быть больше нуля" }
  }
  const deliveryRaw = String(rec.delivery_method || "").trim()
  const delivery =
    deliveryRaw && CUSTOM_ORDER_DELIVERY.includes(deliveryRaw as CustomOrderDelivery)
      ? (deliveryRaw as CustomOrderDelivery)
      : null
  const note = String(rec.quote_note || "")
    .trim()
    .slice(0, MAX_CUSTOM_ORDER_MESSAGE)
  const clientPicksPvz = delivery === "ozon" && rec.client_picks_pvz !== false
  return {
    quote_amount: total,
    quote_items_amount: items,
    quote_discount_amount: discount,
    quote_shipping_amount: shipping,
    quote_other_amount: other,
    quote_note: note || null,
    delivery_method: delivery,
    client_picks_pvz: clientPicksPvz,
    pay_on_arrival: clientPicksPvz && rec.pay_on_arrival === true,
  }
}

export function customOrderArrived(status?: unknown) {
  const key = String(status || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_")
  return (
    key === "in_pickup_point" ||
    key === "posting_in_pickup_point" ||
    key === "in_delivery_point" ||
    key === "delivered" ||
    key === "posting_delivered" ||
    key === "posting_received" ||
    key === "posting_conditionally_delivered" ||
    key === "received"
  )
}

export function customCheckoutCanPay(order: {
  pay_on_arrival?: unknown
  delivery_method?: unknown
  buyer_ready_at?: unknown
  ozon_posting_status?: unknown
  paid_at?: unknown
}) {
  if (order.paid_at) return false
  const postpay =
    order.delivery_method === "ozon" && order.pay_on_arrival === true
  if (!postpay) return true
  return Boolean(order.buyer_ready_at) && customOrderArrived(order.ozon_posting_status)
}

export function parseCustomOrderStatus(body: unknown): CustomOrderStatus | { error: string } {
  const rec =
    body && typeof body === "object" ? (body as Record<string, unknown>) : {}
  const status = String(rec.status || "").trim()
  if (!CUSTOM_ORDER_STATUSES.includes(status as CustomOrderStatus)) {
    return { error: "Неизвестный статус" }
  }
  return status as CustomOrderStatus
}

export function presentCustomOrder(row: Record<string, unknown>) {
  const urls = Array.isArray(row.image_urls)
    ? row.image_urls.filter((url): url is string => typeof url === "string" && Boolean(url))
    : []
  return {
    id: String(row.id || ""),
    name: String(row.name || ""),
    email: row.email ? String(row.email) : null,
    phone: row.phone ? String(row.phone) : null,
    telegram: row.telegram ? String(row.telegram) : null,
    max_account: row.max_account ? String(row.max_account) : null,
    vk: row.vk ? String(row.vk) : null,
    message: String(row.message || ""),
    product_id: row.product_id ? String(row.product_id) : null,
    product_title: row.product_title ? String(row.product_title) : null,
    image_urls: urls,
    status: String(row.status || "new"),
    ip: row.ip ? String(row.ip) : null,
    quote_amount: (() => {
      const amount = Number(row.quote_amount)
      return Number.isFinite(amount) ? amount : null
    })(),
    quote_items_amount: Number.isFinite(Number(row.quote_items_amount))
      ? Number(row.quote_items_amount)
      : null,
    quote_discount_amount: Number.isFinite(Number(row.quote_discount_amount))
      ? Number(row.quote_discount_amount)
      : null,
    quote_shipping_amount: Number.isFinite(Number(row.quote_shipping_amount))
      ? Number(row.quote_shipping_amount)
      : null,
    quote_other_amount: Number.isFinite(Number(row.quote_other_amount))
      ? Number(row.quote_other_amount)
      : null,
    promo_code: row.promo_code ? String(row.promo_code) : null,
    promo_discount: Number.isFinite(Number(row.promo_discount))
      ? Number(row.promo_discount)
      : null,
    quote_note: row.quote_note ? String(row.quote_note) : null,
    delivery_method: row.delivery_method ? String(row.delivery_method) : null,
    client_picks_pvz: row.client_picks_pvz === true,
    pay_on_arrival: row.pay_on_arrival === true,
    buyer_ready_at: row.buyer_ready_at ? String(row.buyer_ready_at) : null,
    ozon_posting_status: row.ozon_posting_status
      ? String(row.ozon_posting_status)
      : null,
    shop_number: row.shop_number ? String(row.shop_number) : null,
    order_url: shopOrderUrl(row.shop_number ? String(row.shop_number) : null),
    checkout_token: row.checkout_token ? String(row.checkout_token) : null,
    checkout_url: customOrderCheckoutUrl(
      row.checkout_token ? String(row.checkout_token) : null
    ),
    paid_at: row.paid_at ? String(row.paid_at) : null,
    gift_card_amount: Number.isFinite(Number(row.gift_card_amount))
      ? Number(row.gift_card_amount)
      : null,
    gift_card_code: row.gift_card_code ? String(row.gift_card_code) : null,
    ozon_point_id: row.ozon_point_id ? String(row.ozon_point_id) : null,
    ozon_point_name: row.ozon_point_name ? String(row.ozon_point_name) : null,
    ozon_point_address: row.ozon_point_address
      ? String(row.ozon_point_address)
      : null,
    ozon_order_number: row.ozon_order_number
      ? String(row.ozon_order_number)
      : null,
    ozon_posting_number: row.ozon_posting_number
      ? String(row.ozon_posting_number)
      : null,
    ozon_tracking: row.ozon_tracking ? String(row.ozon_tracking) : null,
    created_at: row.created_at ? String(row.created_at) : undefined,
    updated_at: row.updated_at ? String(row.updated_at) : undefined,
  }
}

export function presentPublicCustomCheckout(
  row: Record<string, unknown>,
  product?: {
    title?: string | null
    handle?: string | null
    thumbnail?: string | null
  } | null,
  accessToken?: string | null
) {
  const presented = presentCustomOrder(row)
  const paid = Boolean(row.paid_at)
  const title =
    (product?.title && String(product.title)) ||
    presented.product_title ||
    "Индивидуальный заказ"
  const token = paid ? String(accessToken || "").trim() || null : null
  return {
    token: presented.checkout_token,
    shop_number: presented.shop_number,
    order_url: shopOrderUrl(presented.shop_number, process.env, token),
    title,
    note: presented.quote_note || presented.message,
    quote_note: presented.quote_note,
    message: presented.message,
    amount: presented.quote_amount,
    items_amount: presented.quote_items_amount ?? presented.quote_amount,
    discount_amount:
      (presented.quote_discount_amount || 0) + (presented.promo_discount || 0),
    shipping_amount: presented.quote_shipping_amount || 0,
    other_amount: presented.quote_other_amount || 0,
    promo_code: presented.promo_code,
    currency: "rub",
    image_urls: presented.image_urls,
    product_id: presented.product_id,
    product_handle: product?.handle ? String(product.handle) : null,
    product_thumbnail: product?.thumbnail ? String(product.thumbnail) : null,
    name: presented.name,
    email: presented.email,
    phone: presented.phone,
    client_picks_pvz:
      presented.delivery_method === "ozon" && presented.client_picks_pvz,
    pay_on_arrival:
      presented.delivery_method === "ozon" && presented.pay_on_arrival,
    placed: Boolean(presented.buyer_ready_at),
    arrived: customOrderArrived(presented.ozon_posting_status),
    can_pay: customCheckoutCanPay(row),
    paid,
    gift_card_amount: presented.gift_card_amount,
    gift_card_code: paid ? presented.gift_card_code : null,
    ozon_point_id: presented.ozon_point_id,
    ozon_point_name: presented.ozon_point_name,
    ozon_point_address: presented.ozon_point_address,
    ozon_order_number: presented.ozon_order_number,
    ozon_posting_number: presented.ozon_posting_number,
    ozon_tracking: presented.ozon_tracking,
    access_token: token,
  }
}

export function messengerHref(
  value: string,
  network: "telegram" | "vk"
): string {
  const raw = value.trim()
  if (/^https?:\/\//i.test(raw)) return raw
  if (network === "telegram") {
    if (/t\.me\//i.test(raw)) {
      return raw.startsWith("http") ? raw : `https://${raw.replace(/^\/\//, "")}`
    }
    return `https://t.me/${raw.replace(/^@/, "")}`
  }
  if (/vk\.com\//i.test(raw)) {
    return raw.startsWith("http") ? raw : `https://${raw.replace(/^\/\//, "")}`
  }
  return `https://vk.com/${raw.replace(/^@/, "")}`
}

export function primaryContact(row: {
  email?: string | null
  phone?: string | null
  telegram?: string | null
  max_account?: string | null
  vk?: string | null
}): string {
  return (
    row.email ||
    row.phone ||
    row.telegram ||
    row.max_account ||
    row.vk ||
    "—"
  )
}
