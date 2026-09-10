import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { deleteGroup } from "../../../../../../lib/delegat-bridge/groups"

export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  try {
    const payload = await deleteGroup(req.scope, req.params.id)
    res.json(payload)
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}
