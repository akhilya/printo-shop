import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { parseShopLink } from "../../../lib/shop-link"
import { cacheShopSetting, getShopSetting } from "../../../lib/shop-setting"
import { SHOP_SETTING_MODULE } from "../../../modules/shop-setting"
import type ShopSettingModuleService from "../../../modules/shop-setting/service"

function presentLink(row: Record<string, unknown>) {
  return {
    path: String(row.redirect_path || ""),
    target: String(row.redirect_target || ""),
  }
}

export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) {
  const row = (await getShopSetting(req.scope)) as unknown as Record<
    string,
    unknown
  >
  res.json({ link: presentLink(row) })
}

export async function POST(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) {
  const parsed = parseShopLink(req.body)
  if (parsed.error) {
    res.status(400).json({ message: parsed.error })
    return
  }
  const row = (await getShopSetting(req.scope)) as unknown as Record<
    string,
    unknown
  >
  const service: ShopSettingModuleService = req.scope.resolve(
    SHOP_SETTING_MODULE
  )
  const updated = await service.updateShopSettings({
    id: String(row.id),
    redirect_path: parsed.path,
    redirect_target: parsed.target,
  })
  const next = (Array.isArray(updated) ? updated[0] : updated) as unknown as
    | Record<string, unknown>
    | undefined
  const presented = {
    ...row,
    ...(next || {}),
    redirect_path: parsed.path,
    redirect_target: parsed.target,
  }
  cacheShopSetting(presented)
  res.json({ link: presentLink(presented) })
}
