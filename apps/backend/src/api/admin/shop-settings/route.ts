import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import {
  cacheShopSetting,
  getShopSetting,
  parseShopSettingUpdate,
  presentShopSetting,
} from "../../../lib/shop-setting"
import { SHOP_SETTING_MODULE } from "../../../modules/shop-setting"
import type ShopSettingModuleService from "../../../modules/shop-setting/service"

export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) {
  const row = await getShopSetting(req.scope)
  res.json({
    shop: presentShopSetting(row as unknown as Record<string, unknown>, {
      admin: true,
    }),
  })
}

export async function POST(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) {
  const row = await getShopSetting(req.scope)
  const service: ShopSettingModuleService = req.scope.resolve(
    SHOP_SETTING_MODULE
  )
  const patch = parseShopSettingUpdate(
    req.body,
    row as unknown as Record<string, unknown>
  )
  const updated = await service.updateShopSettings({
    id: String((row as { id: string }).id),
    ...patch,
  })
  const next = Array.isArray(updated) ? updated[0] : updated
  const presented = {
    ...(row as unknown as Record<string, unknown>),
    ...((next || {}) as Record<string, unknown>),
  }
  cacheShopSetting(presented)
  res.json({
    shop: presentShopSetting(presented, { admin: true }),
  })
}
