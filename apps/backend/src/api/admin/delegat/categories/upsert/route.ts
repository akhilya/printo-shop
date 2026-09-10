import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { upsertCategory } from "../../../../../lib/delegat-bridge/service"

export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const payload = await upsertCategory(req.scope, req.body as never)
  res.json(payload)
}
