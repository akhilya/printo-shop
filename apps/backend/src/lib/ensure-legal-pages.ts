import { MedusaContainer } from "@medusajs/framework"
import { DEFAULT_LEGAL_PAGES } from "./legal-page"
import { LEGAL_PAGE_MODULE } from "../modules/legal-page"
import type LegalPageModuleService from "../modules/legal-page/service"

export async function ensureDefaultLegalPages(container: MedusaContainer) {
  const service: LegalPageModuleService = container.resolve(LEGAL_PAGE_MODULE)
  const existing = await service.listLegalPages({}, { take: 20 })
  const have = new Set(existing.map((row) => String(row.slug)))
  const missing = DEFAULT_LEGAL_PAGES.filter((item) => !have.has(item.slug))
  if (!missing.length) return existing
  await service.createLegalPages(missing)
  return service.listLegalPages({}, { take: 20 })
}
