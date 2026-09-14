import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { loadOzonPoints } from "../../../../lib/ozon-delivery"
import { getShopSetting } from "../../../../lib/shop-setting"

export async function POST(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) {
  const body = (req.body || {}) as {
    query?: string
    south?: number
    west?: number
    north?: number
    east?: number
    zoom?: number
  }
  const row = (await getShopSetting(req.scope)) as unknown as Record<
    string,
    unknown
  >
  const payload = await loadOzonPoints(row, {
    query: String(body.query || "").trim(),
    south: body.south,
    west: body.west,
    north: body.north,
    east: body.east,
    zoom: body.zoom,
  })
  res.json(payload)
}
