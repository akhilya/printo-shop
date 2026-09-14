import { MedusaContainer } from "@medusajs/framework"
import { shouldReplaceLegalBody } from "./legal-copy"
import { DEFAULT_LEGAL_PAGES } from "./legal-page"
import { LEGAL_PAGE_MODULE } from "../modules/legal-page"
import type LegalPageModuleService from "../modules/legal-page/service"

export async function ensureDefaultLegalPages(container: MedusaContainer) {
  const service: LegalPageModuleService = container.resolve(LEGAL_PAGE_MODULE)
  const existing = await service.listLegalPages({}, { take: 20 })
  const bySlug = new Map(existing.map((row) => [String(row.slug), row]))
  const missing = DEFAULT_LEGAL_PAGES.filter((item) => !bySlug.has(item.slug))
  if (missing.length) {
    await service.createLegalPages(missing)
  }
  const updates = DEFAULT_LEGAL_PAGES.flatMap((item) => {
    const row = bySlug.get(item.slug) as { id?: string; body?: string } | undefined
    if (!row?.id) return []
    if (!shouldReplaceLegalBody(row.body)) return []
    return [{ id: String(row.id), title: item.title, body: item.body }]
  })
  if (updates.length) {
    await service.updateLegalPages(updates)
  }
  return service.listLegalPages({}, { take: 20 })
}
