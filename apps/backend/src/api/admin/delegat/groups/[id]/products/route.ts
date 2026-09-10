import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { addProductsToGroup } from "../../../../../../lib/delegat-bridge/groups"

export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const collectionId = req.params.id
  const productIds = (req.body as { product_ids?: string[] })?.product_ids ?? []
  try {
    const payload = await addProductsToGroup(req.scope, collectionId, productIds)
    res.status(payload.success ? 200 : 400).json(payload)
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}
