import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { listLegalPagesCached } from "../../../../lib/ensure-legal-pages"
import { presentLegalPage } from "../../../../lib/legal-page"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const slug = String(req.params.slug || "").trim()
  const rows = await listLegalPagesCached(req.scope)
  const row = rows.find(
    (item) =>
      String((item as { slug?: string }).slug) === slug &&
      (item as { enabled?: boolean }).enabled !== false
  )
  if (!row) {
    res.status(404).json({ message: "Страница не найдена" })
    return
  }
  res.setHeader(
    "Cache-Control",
    "public, max-age=60, stale-while-revalidate=300"
  )
  res.json({
    page: presentLegalPage(row as unknown as Record<string, unknown>),
  })
}
