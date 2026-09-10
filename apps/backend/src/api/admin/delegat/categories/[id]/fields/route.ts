import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { defaultFields } from "../../../../../../lib/delegat-bridge/service"

export async function GET(_req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  res.json({ success: true, fields: defaultFields() })
}
