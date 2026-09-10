import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { listCategories } from "../../../../lib/delegat-bridge/service"

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const parentId = typeof req.query.parent_id === "string" ? req.query.parent_id : undefined
  const search = typeof req.query.search === "string" ? req.query.search : undefined
  const payload = await listCategories(req.scope, parentId, search)
  res.json(payload)
}
