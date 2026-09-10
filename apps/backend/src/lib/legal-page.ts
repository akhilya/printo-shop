import { renderLegalMarkdown } from "./legal-markdown"

export const LEGAL_SLUGS = [
  "delivery",
  "offer",
  "contacts",
  "privacy",
] as const
export type LegalSlug = (typeof LEGAL_SLUGS)[number]

export const LEGAL_SLUG_LABELS: Record<LegalSlug, string> = {
  delivery: "Доставка",
  offer: "Оферта",
  contacts: "Контакты",
  privacy: "Конфиденциальность",
}

export const MAX_LEGAL_TITLE = 120
export const MAX_LEGAL_BODY = 50000

export const DEFAULT_LEGAL_PAGES: Array<{
  slug: LegalSlug
  title: string
  body: string
  enabled: boolean
}> = [
  {
    slug: "delivery",
    title: "Доставка",
    body: "Доставляем по России. Способ и срок уточняются на чекауте.\n\nТекст условий появится здесь.",
    enabled: true,
  },
  {
    slug: "offer",
    title: "Оферта",
    body: "Публичная оферта будет опубликована на этой странице перед запуском продаж.",
    enabled: true,
  },
  {
    slug: "contacts",
    title: "Контакты",
    body: "Напишите на почту магазина. Реквизиты появятся здесь.",
    enabled: true,
  },
  {
    slug: "privacy",
    title: "Конфиденциальность",
    body: "Политика обработки персональных данных будет опубликована на этой странице.",
    enabled: true,
  },
]

export type LegalPageInput = {
  slug: string
  title: string
  body: string
  enabled: boolean
}

export function parseLegalPageInput(
  body: unknown,
  partial = false
): LegalPageInput | { error: string } {
  const rec =
    body && typeof body === "object" ? (body as Record<string, unknown>) : {}
  const slug = String(rec.slug || "").trim()
  const title = String(rec.title || "").trim().slice(0, MAX_LEGAL_TITLE)
  const text = String(rec.body || "").slice(0, MAX_LEGAL_BODY)
  if (!partial && (!slug || !title || !text.trim())) {
    return { error: "Нужны страница, заголовок и текст" }
  }
  if (slug && !LEGAL_SLUGS.includes(slug as LegalSlug) && !partial) {
    return { error: "Неизвестная страница" }
  }
  return {
    slug,
    title,
    body: text,
    enabled: rec.enabled === false ? false : true,
  }
}

export function presentLegalPage(row: Record<string, unknown>) {
  const body = String(row.body || "")
  return {
    id: String(row.id || ""),
    slug: String(row.slug || ""),
    title: String(row.title || ""),
    body,
    html: renderLegalMarkdown(body),
    enabled: row.enabled !== false,
  }
}
