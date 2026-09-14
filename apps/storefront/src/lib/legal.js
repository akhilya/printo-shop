import { ref } from "vue"
import { BACKEND_URL, storeHeaders } from "./sdk.js"

export const LEGAL_FALLBACK = [
  { slug: "delivery", title: "Доставка" },
  { slug: "returns", title: "Возврат" },
  { slug: "offer", title: "Оферта" },
  { slug: "contacts", title: "Контакты" },
  { slug: "privacy", title: "Конфиденциальность" },
]

export const LEGAL_DOC_SLUGS = ["delivery", "returns", "offer", "privacy"]

export const legalPages = ref([...LEGAL_FALLBACK])

export function legalDocumentPages(pages = legalPages.value) {
  const rank = new Map(LEGAL_DOC_SLUGS.map((slug, index) => [slug, index]))
  return pages
    .filter((page) => rank.has(page.slug))
    .sort((a, b) => (rank.get(a.slug) ?? 99) - (rank.get(b.slug) ?? 99))
}

export function usefulExtraPages(pages = legalPages.value) {
  return pages.filter((page) => !LEGAL_DOC_SLUGS.includes(page.slug))
}

export async function loadLegalPages() {
  try {
    const res = await fetch(`${BACKEND_URL}/store/legal-pages`, {
      headers: storeHeaders(),
    })
    if (!res.ok) return
    const data = await res.json()
    const pages = (data.pages || []).filter((page) => page.enabled !== false)
    if (pages.length) legalPages.value = pages
  } catch {
    legalPages.value = [...LEGAL_FALLBACK]
  }
}
