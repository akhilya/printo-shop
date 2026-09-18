import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { listLegalPagesCached } from "../../../lib/ensure-legal-pages"
import { LEGAL_SLUGS, presentLegalPageNav } from "../../../lib/legal-page"

export async function OPTIONS(_req: MedusaRequest, res: MedusaResponse) {
  res.status(204).end()
}

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const rows = await listLegalPagesCached(req.scope)
  const order = new Map(LEGAL_SLUGS.map((slug, index) => [slug, index]))
  const pages = rows
    .filter((row) => (row as { enabled?: boolean }).enabled !== false)
    .map((row) => presentLegalPageNav(row as unknown as Record<string, unknown>))
    .sort(
      (a, b) =>
        (order.get(a.slug as (typeof LEGAL_SLUGS)[number]) ?? 99) -
        (order.get(b.slug as (typeof LEGAL_SLUGS)[number]) ?? 99)
    )
  res.setHeader(
    "Cache-Control",
    "public, max-age=60, stale-while-revalidate=300"
  )
  res.json({ pages })
}
