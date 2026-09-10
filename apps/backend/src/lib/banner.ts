export const BANNER_SLOTS = ["home_hero", "home_catalog", "home_custom"] as const
export type BannerSlot = (typeof BANNER_SLOTS)[number]

export const DEFAULT_BANNERS: Array<{
  slot: BannerSlot
  title: string
  body: string
  cta_label: string
  cta_href: string
  enabled: boolean
}> = [
  {
    slot: "home_hero",
    title: "В официальном магазине дешевле",
    body: "Маркетплейсы берут большую комиссию с каждой продажи. Здесь вы платите за фигурку, без этой наценки.",
    cta_label: "Смотреть товары",
    cta_href: "/products",
    enabled: true,
  },
  {
    slot: "home_catalog",
    title: "Весь каталог",
    body: "Все фигурки в одном месте — без комиссий витрин.",
    cta_label: "Смотреть каталог",
    cta_href: "/products",
    enabled: true,
  },
  {
    slot: "home_custom",
    title: "Индивидуальный заказ",
    body: "Нужна фигурка не из каталога или другая версия существующей — опишите, что сделать. Свяжемся и обсудим.",
    cta_label: "Оставить заявку",
    cta_href: "/custom-order",
    enabled: true,
  },
]

export type BannerInput = {
  slot: string
  title: string
  body: string
  cta_label: string | null
  cta_href: string | null
  image_url: string | null
  enabled: boolean
}

export function parseBannerInput(
  body: unknown,
  partial = false
): BannerInput | { error: string } {
  const rec =
    body && typeof body === "object" ? (body as Record<string, unknown>) : {}
  const slot = String(rec.slot || "").trim()
  const title = String(rec.title || "").trim()
  const text = String(rec.body || "").trim()
  if (!partial && (!slot || !title || !text)) {
    return { error: "Нужны слот, заголовок и текст" }
  }
  if (slot && !BANNER_SLOTS.includes(slot as BannerSlot) && !partial) {
    return { error: "Неизвестный слот баннера" }
  }
  return {
    slot,
    title,
    body: text,
    cta_label: rec.cta_label == null ? null : String(rec.cta_label).trim() || null,
    cta_href: rec.cta_href == null ? null : String(rec.cta_href).trim() || null,
    image_url: rec.image_url == null ? null : String(rec.image_url).trim() || null,
    enabled: rec.enabled === false ? false : true,
  }
}

export function presentBanner(row: Record<string, unknown>) {
  return {
    id: String(row.id || ""),
    slot: String(row.slot || ""),
    title: String(row.title || ""),
    body: String(row.body || ""),
    cta_label: row.cta_label ? String(row.cta_label) : null,
    cta_href: row.cta_href ? String(row.cta_href) : null,
    image_url: row.image_url ? String(row.image_url) : null,
    enabled: row.enabled !== false,
  }
}
