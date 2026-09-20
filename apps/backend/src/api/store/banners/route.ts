import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { presentBanner } from "../../../lib/banner"
import { ensureDefaultBanners } from "../../../lib/ensure-banners"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const slot = String(req.query.slot || "").trim()
  const rows = await ensureDefaultBanners(req.scope)
  const banners = rows
    .filter((row) => row.enabled !== false)
    .filter((row) => (slot ? row.slot === slot : true))
    .map((row) => presentBanner(row as unknown as Record<string, unknown>))
  res.setHeader(
    "Cache-Control",
    "public, max-age=60, stale-while-revalidate=600"
  )
  res.json({ banners })
}
