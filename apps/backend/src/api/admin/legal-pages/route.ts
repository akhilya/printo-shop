import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { ensureDefaultLegalPages } from "../../../lib/ensure-legal-pages"
import { LEGAL_SLUGS, presentLegalPage } from "../../../lib/legal-page"

export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) {
  const rows = await ensureDefaultLegalPages(req.scope)
  const order = new Map(LEGAL_SLUGS.map((slug, index) => [slug, index]))
  const pages = rows
    .map((row) => presentLegalPage(row as unknown as Record<string, unknown>))
    .sort(
      (a, b) =>
        (order.get(a.slug as (typeof LEGAL_SLUGS)[number]) ?? 99) -
        (order.get(b.slug as (typeof LEGAL_SLUGS)[number]) ?? 99)
    )
  res.json({ pages })
}
