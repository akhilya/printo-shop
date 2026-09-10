import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { getHealth } from "../../../../lib/delegat-bridge/service"

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const payload = await getHealth(req.scope)
  res.json(payload)
}
