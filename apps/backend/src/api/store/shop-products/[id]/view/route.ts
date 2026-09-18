import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { bumpProductViews } from "../../../../../lib/shop-catalog"

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const id = String(req.params.id || "")
  try {
    const ok = await bumpProductViews(req.scope, id)
    if (!ok) {
      res.status(404).json({ ok: false })
      return
    }
    res.json({ ok: true })
  } catch {
    res.status(500).json({ ok: false })
  }
}
