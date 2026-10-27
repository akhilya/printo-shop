import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { getHomeShopProducts } from "../../../lib/shop-catalog"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  try {
    const result = await getHomeShopProducts(req.scope)
    res.setHeader("Cache-Control", "public, max-age=60, stale-while-revalidate=600")
    res.json(result)
  } catch {
    res.status(500).json({ message: "Не удалось загрузить каталог." })
  }
}
