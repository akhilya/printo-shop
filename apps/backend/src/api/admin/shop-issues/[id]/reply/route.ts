import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { errorText, replyShopIssue } from "../../../../../lib/shop-issue"

export async function POST(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) {
  try {
    const issue = await replyShopIssue(
      req.scope,
      String(req.params.id || ""),
      req.body
    )
    res.json({ success: true, issue })
  } catch (error) {
    const status =
      error instanceof MedusaError && error.type === MedusaError.Types.NOT_FOUND
        ? 404
        : 400
    res.status(status).json({ success: false, message: errorText(error) })
  }
}
