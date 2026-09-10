import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { listGroups } from "../../../../lib/delegat-bridge/groups"

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  try {
    const payload = await listGroups(req.scope)
    res.json(payload)
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}
