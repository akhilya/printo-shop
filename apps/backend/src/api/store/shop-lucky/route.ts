import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { getLuckyShopProduct } from "../../../lib/shop-catalog"

export async function OPTIONS(_req: MedusaRequest, res: MedusaResponse) {
  res.status(204).end()
}

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  try {
    const exclude =
      typeof req.query.exclude === "string" ? req.query.exclude : ""
    const product = await getLuckyShopProduct(req.scope, exclude)
    res.json({ product })
  } catch {
    res.json({ product: null })
  }
}
