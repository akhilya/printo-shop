import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { getStoredOzonLabel } from "../../../../../../lib/ozon-fulfill"
import { errorText } from "../../../../../../lib/shop-order"

export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) {
  try {
    const label = await getStoredOzonLabel(req.scope, req.params.id)
    if (!label) {
      res.status(404).json({
        success: false,
        error: "Этикетка появится после сборки заказа",
      })
      return
    }
    res.json({
      success: true,
      content_type: label.contentType,
      file_name: label.fileName,
      file_content: label.bytes.toString("base64"),
    })
  } catch (error) {
    res.status(400).json({
      success: false,
      error: errorText(error, "label_failed"),
    })
  }
}
