import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { applyOzonShippingToCart } from "../../../../lib/ozon-shipping"

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const body = (req.body || {}) as {
    cart_id?: string
    point_id?: string
    point_address?: string
    lat?: number
    lon?: number
    phone?: string
  }
  const cartId = String(body.cart_id || "").trim()
  const pointId = String(body.point_id || "").trim()
  if (!cartId || !pointId) {
    res.status(400).json({ message: "cart_id and point_id required" })
    return
  }
  const result = await applyOzonShippingToCart(req.scope, {
    cartId,
    pointId,
    pointAddress: String(body.point_address || "").trim() || undefined,
    lat: Number(body.lat),
    lon: Number(body.lon),
    phone: String(body.phone || "").trim() || undefined,
  })
  res.json(result)
}
