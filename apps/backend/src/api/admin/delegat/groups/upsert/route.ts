import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import {
  upsertGroup,
  type DelegatGroupPayload,
} from "../../../../../lib/delegat-bridge/groups"

export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  try {
    const payload = await upsertGroup(req.scope, req.body as DelegatGroupPayload)
    res.status(payload.success ? 200 : 400).json(payload)
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}
