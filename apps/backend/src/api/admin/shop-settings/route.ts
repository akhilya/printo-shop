import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import {
  DEFAULT_CLOSED_MESSAGE,
  getShopSetting,
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
    shop: presentShopSetting(row as unknown as Record<string, unknown>),
  })
}

export async function POST(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) {
  const rec =
    req.body && typeof req.body === "object"
      ? (req.body as Record<string, unknown>)
      : {}
  const row = await getShopSetting(req.scope)
  const service: ShopSettingModuleService = req.scope.resolve(
    SHOP_SETTING_MODULE
  )
  const message = String(rec.message ?? row.message ?? "").trim()
  const updated = await service.updateShopSettings({
    id: String(row.id),
    closed: rec.closed === true,
    message: message || DEFAULT_CLOSED_MESSAGE,
  })
  const next = Array.isArray(updated) ? updated[0] : updated
  res.json({
    shop: presentShopSetting(
      (next || row) as unknown as Record<string, unknown>
    ),
  })
}
