import { MedusaContainer } from "@medusajs/framework"
import { DEFAULT_BANNERS } from "./banner"
import { BANNER_MODULE } from "../modules/banner"
import type BannerModuleService from "../modules/banner/service"

export async function ensureDefaultBanners(container: MedusaContainer) {
  const service: BannerModuleService = container.resolve(BANNER_MODULE)
  const existing = await service.listBanners({}, { take: 20 })
  const have = new Set(existing.map((row) => String(row.slot)))
  const missing = DEFAULT_BANNERS.filter((item) => !have.has(item.slot))
  if (!missing.length) return existing
  await service.createBanners(missing)
  return service.listBanners({}, { take: 20, order: { slot: "ASC" } })
}
