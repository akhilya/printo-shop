import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { formatError, upsertProductsBulk } from "../../../../../lib/delegat-bridge/service"
import type { DelegatProductPayload } from "../../../../../lib/delegat-bridge/types"

export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  try {
    const products = (req.body as { products?: DelegatProductPayload[] })?.products ?? []
    const payload = await upsertProductsBulk(req.scope, products)
    res.json(payload)
  } catch (error) {
    res.status(500).json({
      success: false,
      error: formatError(error),
    })
  }
}
