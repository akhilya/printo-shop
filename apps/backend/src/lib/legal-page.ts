import { LEGAL_COPY } from "./legal-copy"
import { renderLegalMarkdown } from "./legal-markdown"

export const LEGAL_SLUGS = [
  "delivery",
  "returns",
  "offer",
  "contacts",
  "privacy",
] as const
export type LegalSlug = (typeof LEGAL_SLUGS)[number]

export const LEGAL_SLUG_LABELS: Record<LegalSlug, string> = {
  delivery: "Доставка",
  returns: "Возврат",
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
    body: LEGAL_COPY.delivery,
    enabled: true,
  },
  {
    slug: "returns",
    title: "Возврат",
    body: LEGAL_COPY.returns,
    enabled: true,
  },
  {
    slug: "offer",
    title: "Оферта",
    body: LEGAL_COPY.offer,
    enabled: true,
  },
  {
    slug: "contacts",
    title: "Контакты",
    body: LEGAL_COPY.contacts,
    enabled: true,
  },
  {
    slug: "privacy",
    title: "Конфиденциальность",
    body: LEGAL_COPY.privacy,
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

export function presentLegalPageNav(row: Record<string, unknown>) {
  return {
    id: String(row.id || ""),
    slug: String(row.slug || ""),
    title: String(row.title || ""),
    enabled: row.enabled !== false,
  }
}

export function presentLegalPage(row: Record<string, unknown>) {
  const body = String(row.body || "")
  return {
    ...presentLegalPageNav(row),
    body,
    html: renderLegalMarkdown(body),
  }
}
