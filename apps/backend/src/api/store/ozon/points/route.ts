import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { loadOzonPoints } from "../../../../lib/ozon-delivery"
import { getShopSetting } from "../../../../lib/shop-setting"

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const body = (req.body || {}) as {
    city?: string
    query?: string
    lat?: number
    lon?: number
    south?: number
    west?: number
    north?: number
    east?: number
    zoom?: number
    phone?: string
    provider?: "seller" | "delivery_api"
  }
  const row = (await getShopSetting(req.scope)) as unknown as Record<string, unknown>
  const payload = await loadOzonPoints(row, {
    city: String(body.city || "").trim(),
    query: String(body.query || "").trim(),
    lat: body.lat,
    lon: body.lon,
    south: body.south,
    west: body.west,
    north: body.north,
    east: body.east,
    zoom: body.zoom,
    phone: String(body.phone || "").trim(),
    provider: body.provider === "delivery_api" ? "delivery_api" : "seller",
  })
  res.json(payload)
}
