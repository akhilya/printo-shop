import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { getShopSetting, presentShopSetting } from "../../../lib/shop-setting"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const row = await getShopSetting(req.scope)
  res.json({
    shop: presentShopSetting(row as unknown as Record<string, unknown>),
  })
}
