import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { errorText, getShopIssue } from "../../../../lib/shop-issue"

export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) {
  try {
    const issue = await getShopIssue(req.scope, String(req.params.id || ""))
    res.json({ issue })
  } catch (error) {
    const status =
      error instanceof MedusaError && error.type === MedusaError.Types.NOT_FOUND
        ? 404
        : 400
    res.status(status).json({ success: false, message: errorText(error) })
  }
}
