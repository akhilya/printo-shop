import { MedusaContainer } from "@medusajs/framework"
import { SHOP_SETTING_MODULE } from "../modules/shop-setting"
import type ShopSettingModuleService from "../modules/shop-setting/service"

export const SHOP_SETTING_KEY = "storefront"
export const DEFAULT_CLOSED_MESSAGE = "Магазин в разработке."

export function presentShopSetting(row: Record<string, unknown>) {
  return {
    id: String(row.id || ""),
    closed: row.closed === true,
    message: String(row.message || DEFAULT_CLOSED_MESSAGE).trim() || DEFAULT_CLOSED_MESSAGE,
  }
}

export async function getShopSetting(container: MedusaContainer) {
  const service: ShopSettingModuleService = container.resolve(SHOP_SETTING_MODULE)
  const existing = await service.listShopSettings(
    { key: SHOP_SETTING_KEY },
    { take: 1 }
  )
  if (existing[0]) return existing[0]
  const created = await service.createShopSettings({
    key: SHOP_SETTING_KEY,
    closed: false,
    message: DEFAULT_CLOSED_MESSAGE,
  })
  return Array.isArray(created) ? created[0] : created
}
