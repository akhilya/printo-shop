import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { listShopCatalogPage } from "../../../lib/shop-catalog"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  try {
    const page = await listShopCatalogPage(req.scope, {
      q: typeof req.query.q === "string" ? req.query.q : "",
      category_id:
        typeof req.query.category_id === "string" ? req.query.category_id : "",
      collection_id:
        typeof req.query.collection_id === "string"
          ? req.query.collection_id
          : "",
      in_stock:
        req.query.in_stock === "1" ||
        req.query.in_stock === "true",
      offset: Number(req.query.offset || 0),
      limit: Number(req.query.limit || 20),
    })
    res.setHeader(
      "Cache-Control",
      "public, max-age=15, stale-while-revalidate=120"
    )
    res.json(page)
  } catch {
    res.status(500).json({ message: "Не удалось загрузить каталог." })
  }
}
