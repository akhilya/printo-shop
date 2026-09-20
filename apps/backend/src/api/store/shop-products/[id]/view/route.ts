import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { bumpProductViews } from "../../../../../lib/shop-catalog"

export async function OPTIONS(_req: MedusaRequest, res: MedusaResponse) {
  res.status(204).end()
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const id = String(req.params.id || "").trim()
  if (!id) {
    res.status(404).json({ ok: false })
    return
  }
  // Answer first: a product-update workflow on this path stalled the whole
  // api.printo.studio origin (~9s) and blocked images, lucky, and home APIs.
  res.json({ ok: true })
  void bumpProductViews(req.scope, id).catch(() => undefined)
}
