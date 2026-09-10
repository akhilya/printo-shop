export const CUSTOM_ORDER_STATUSES = ["new", "in_progress", "closed"] as const
export type CustomOrderStatus = (typeof CUSTOM_ORDER_STATUSES)[number]

export const MAX_CUSTOM_ORDER_IMAGES = 6
export const MAX_CUSTOM_ORDER_IMAGE_BYTES = 2 * 1024 * 1024
export const MAX_CUSTOM_ORDER_NAME = 80
export const MAX_CUSTOM_ORDER_CONTACT = 80
export const MAX_CUSTOM_ORDER_MESSAGE = 4000

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
  body: unknown
): ParsedCustomOrder | { error: string } {
  const rec =
    body && typeof body === "object" ? (body as Record<string, unknown>) : {}
  const name = clip(rec.name, MAX_CUSTOM_ORDER_NAME)
  const email = clip(rec.email, MAX_CUSTOM_ORDER_CONTACT)
  const phone = clip(rec.phone, MAX_CUSTOM_ORDER_CONTACT)
  const telegram = clip(rec.telegram, MAX_CUSTOM_ORDER_CONTACT)
  const maxAccount = clip(rec.max_account ?? rec.max, MAX_CUSTOM_ORDER_CONTACT)
  const vk = clip(rec.vk, MAX_CUSTOM_ORDER_CONTACT)
  const message = String(rec.message || rec.body || "").trim().slice(
    0,
    MAX_CUSTOM_ORDER_MESSAGE
  )
  if (!name || !message) {
    return { error: "Введите имя и описание заказа" }
  }
  if (!email && !phone && !telegram && !maxAccount && !vk) {
    return { error: "Укажите хотя бы один способ связи" }
  }
  if (email && !email.includes("@")) {
    return { error: "Проверьте адрес почты" }
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
    email: email || null,
    phone: phone || null,
    telegram: telegram || null,
    max_account: maxAccount || null,
    vk: vk || null,
    message,
    product_id: clip(rec.product_id, 64) || null,
    images,
  }
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
    created_at: row.created_at ? String(row.created_at) : undefined,
    updated_at: row.updated_at ? String(row.updated_at) : undefined,
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
