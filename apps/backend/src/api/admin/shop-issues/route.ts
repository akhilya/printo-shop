import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { errorText, listShopIssues } from "../../../lib/shop-issue"

export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) {
  const limit = Math.min(Math.max(Number(req.query.limit) || 30, 1), 100)
  const offset = Math.max(Number(req.query.offset) || 0, 0)
  const status = String(req.query.status || "open")
  const q = String(req.query.q || "")
  try {
    const result = await listShopIssues(req.scope, { status, q, limit, offset })
    res.json({ ...result, limit, offset })
  } catch (error) {
    res.status(400).json({ success: false, message: errorText(error) })
  }
}
