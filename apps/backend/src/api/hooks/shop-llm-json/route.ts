import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { loadShopLlmCatalog } from "../../../lib/shop-llm-catalog"
import { renderLlmJson, shopLlmOrigin } from "../../../lib/shop-llm"

export const AUTHENTICATE = false

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  try {
    const catalog = await loadShopLlmCatalog(req.scope)
    res.setHeader(
      "Cache-Control",
      "public, max-age=3600, stale-while-revalidate=86400"
    )
    res.json(
      renderLlmJson({
        origin: shopLlmOrigin(process.env),
        ...catalog,
      })
    )
  } catch {
    res.status(500).json({ message: "Не удалось собрать каталог для моделей." })
  }
}
