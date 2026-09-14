import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { loadOzonPointById } from "../../../../../lib/ozon-delivery"
import { getShopSetting } from "../../../../../lib/shop-setting"

export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) {
  const row = (await getShopSetting(req.scope)) as unknown as Record<
    string,
    unknown
  >
  const point = await loadOzonPointById(row, String(req.params.id || ""))
  if (!point) {
    res.status(404).json({ message: "point_not_found" })
    return
  }
  res.json({ point })
}
