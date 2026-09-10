import { ref } from "vue"

export const LEGAL_FALLBACK = [
  { slug: "delivery", title: "Доставка" },
  { slug: "offer", title: "Оферта" },
  { slug: "contacts", title: "Контакты" },
  { slug: "privacy", title: "Конфиденциальность" },
]

export const legalPages = ref([...LEGAL_FALLBACK])

export async function loadLegalPages() {
  try {
    const res = await fetch(
      `${import.meta.env.VITE_MEDUSA_BACKEND_URL}/store/legal-pages`,
      {
        headers: {
          "x-publishable-api-key": import.meta.env.VITE_MEDUSA_PUBLISHABLE_KEY,
        },
      }
    )
    if (!res.ok) return
    const data = await res.json()
    const pages = (data.pages || []).filter((page) => page.enabled !== false)
    if (pages.length) legalPages.value = pages
  } catch {
    legalPages.value = [...LEGAL_FALLBACK]
  }
}
