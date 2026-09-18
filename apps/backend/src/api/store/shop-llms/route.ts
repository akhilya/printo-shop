import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { loadShopLlmCatalog } from "../../../lib/shop-llm-catalog"
import { renderLlmsTxt, shopLlmOrigin } from "../../../lib/shop-llm"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  try {
    const catalog = await loadShopLlmCatalog(req.scope)
    const body = renderLlmsTxt({
      origin: shopLlmOrigin(process.env),
      ...catalog,
    })
    res.setHeader("Content-Type", "text/plain; charset=utf-8")
    res.setHeader(
      "Cache-Control",
      "public, max-age=3600, stale-while-revalidate=86400"
    )
    res.status(200).send(body)
  } catch {
    res.status(500).json({ message: "Не удалось собрать каталог для моделей." })
  }
}
