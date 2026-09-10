import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ensureDefaultLegalPages } from "../../../../lib/ensure-legal-pages"
import { presentLegalPage } from "../../../../lib/legal-page"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const slug = String(req.params.slug || "").trim()
  const rows = await ensureDefaultLegalPages(req.scope)
  const row = rows.find(
    (item) => String(item.slug) === slug && item.enabled !== false
  )
  if (!row) {
    res.status(404).json({ message: "Страница не найдена" })
    return
  }
  res.json({
    page: presentLegalPage(row as unknown as Record<string, unknown>),
  })
}
