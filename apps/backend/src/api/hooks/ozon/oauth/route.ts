import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import {
  exchangeOzonAuthCode,
  ozonOAuthRedirectUri,
  resetOzonAppTokenCache,
} from "../../../../lib/ozon-delivery"
import {
  cacheShopSetting,
  getShopSetting,
} from "../../../../lib/shop-setting"
import { SHOP_SETTING_MODULE } from "../../../../modules/shop-setting"
import type ShopSettingModuleService from "../../../../modules/shop-setting/service"

function adminSettingsUrl() {
  return "/app/shop-settings"
}

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const query = (req.query || {}) as Record<string, unknown>
  const error = String(query.error || "").trim()
  const code = String(query.code || "").trim()
  const state = String(query.state || "").trim()
  if (error) {
    res.redirect(`${adminSettingsUrl()}?ozon=denied`)
    return
  }
  const row = (await getShopSetting(req.scope)) as unknown as Record<
    string,
    unknown
  >
  const expected = String(row.ozon_oauth_state || "").trim()
  const clientId = String(row.ozon_client_id || "").trim()
  const clientSecret = String(row.ozon_oauth_token || "").trim()
  if (!code || !state || !expected || state !== expected || !clientId || !clientSecret) {
    res.redirect(`${adminSettingsUrl()}?ozon=invalid`)
    return
  }
  try {
    const tokens = await exchangeOzonAuthCode({
      clientId,
      clientSecret,
      code,
      redirectUri: ozonOAuthRedirectUri(),
    })
    if (!tokens.refreshToken) {
      res.redirect(`${adminSettingsUrl()}?ozon=invalid`)
      return
    }
    const service: ShopSettingModuleService = req.scope.resolve(
      SHOP_SETTING_MODULE
    )
    const updated = await service.updateShopSettings({
      id: String(row.id),
      ozon_refresh_token: tokens.refreshToken,
      ozon_oauth_state: null,
    })
    const next = Array.isArray(updated) ? updated[0] : updated
    cacheShopSetting({
      ...row,
      ...((next || {}) as Record<string, unknown>),
    })
    resetOzonAppTokenCache()
    res.redirect(`${adminSettingsUrl()}?ozon=connected`)
  } catch {
    res.redirect(`${adminSettingsUrl()}?ozon=failed`)
  }
}
