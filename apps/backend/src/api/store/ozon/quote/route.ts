import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ozonQuoteErrorMessage } from "../../../../lib/ozon-delivery"
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
  try {
    const result = await applyOzonShippingToCart(req.scope, {
      cartId,
      pointId,
      pointAddress: String(body.point_address || "").trim() || undefined,
      lat: Number.isFinite(Number(body.lat)) ? Number(body.lat) : undefined,
      lon: Number.isFinite(Number(body.lon)) ? Number(body.lon) : undefined,
      phone: String(body.phone || "").trim() || undefined,
    })
    res.json(result)
  } catch (error) {
    res.json({
      amount: 0,
      message: ozonQuoteErrorMessage(error),
    })
  }
}
