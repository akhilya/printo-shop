import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { formatError, upsertProduct } from "../../../../../lib/delegat-bridge/service"
import type { DelegatProductPayload } from "../../../../../lib/delegat-bridge/types"

export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  try {
    const payload = await upsertProduct(req.scope, req.body as DelegatProductPayload)
    res.status(payload.success ? 200 : 400).json(payload)
  } catch (error) {
    res.status(500).json({
      success: false,
      error: formatError(error),
    })
  }
}
