import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { getLuckyShopProducts } from "../../../lib/shop-catalog"

export async function OPTIONS(_req: MedusaRequest, res: MedusaResponse) {
  res.status(204).end()
}

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  try {
    const exclude =
      typeof req.query.exclude === "string" ? req.query.exclude : ""
    const limit = Math.min(Math.max(Number(req.query.limit) || 1, 1), 3)
    const products = await getLuckyShopProducts(req.scope, exclude, limit)
    res.json({ products, product: products[0] || null })
  } catch {
    res.json({ product: null })
  }
}
