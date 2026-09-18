import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { listShopGroupsCatalog } from "../../../lib/shop-catalog"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  try {
    const groups = await listShopGroupsCatalog(req.scope)
    res.setHeader(
      "Cache-Control",
      "public, max-age=15, stale-while-revalidate=120"
    )
    res.json({ groups })
  } catch {
    res.status(500).json({ message: "Не удалось загрузить коллекции." })
  }
}
