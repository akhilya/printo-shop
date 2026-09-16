import { randomBytes } from "crypto"
import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import {
  ozonAuthorizeUrl,
  ozonOAuthRedirectUri,
} from "../../../../lib/ozon-delivery"
import {
  cacheShopSetting,
  getShopSetting,
} from "../../../../lib/shop-setting"
import { SHOP_SETTING_MODULE } from "../../../../modules/shop-setting"
import type ShopSettingModuleService from "../../../../modules/shop-setting/service"

export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) {
  const row = (await getShopSetting(req.scope)) as unknown as Record<
    string,
    unknown
  >
  const clientId = String(row.ozon_client_id || "").trim()
  const clientSecret = String(row.ozon_oauth_token || "").trim()
  if (!clientId || !clientSecret) {
    res.status(400).json({
      message: "Сначала сохраните Client ID и Client Secret приложения.",
    })
    return
  }
  const state = randomBytes(16).toString("hex")
  const service: ShopSettingModuleService = req.scope.resolve(SHOP_SETTING_MODULE)
  const updated = await service.updateShopSettings({
    id: String(row.id),
    ozon_oauth_state: state,
  })
  const next = Array.isArray(updated) ? updated[0] : updated
  cacheShopSetting({
    ...row,
    ...((next || {}) as Record<string, unknown>),
  })
  res.redirect(
    ozonAuthorizeUrl({
      clientId,
      redirectUri: ozonOAuthRedirectUri(),
      state,
    })
  )
}
