import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import {
  BATCH_PRODUCT_READ_MAX_ROWS,
  formatError,
} from "../../../../../lib/delegat-bridge/service"
import { delegatReadProductsBatchWorkflow } from "../../../../../workflows/delegat-read-products-batch"

export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  try {
    const ids = (req.body as { ids?: unknown })?.ids
    if (!Array.isArray(ids) || ids.some((id) => typeof id !== "string")) {
      res.status(400).json({
        success: false,
        error: "ids_must_be_string_array",
      })
      return
    }
    if (ids.length > BATCH_PRODUCT_READ_MAX_ROWS) {
      res.status(400).json({
        success: false,
        error: "batch_product_read_too_many_rows",
      })
      return
    }

    const { result: payload } = await delegatReadProductsBatchWorkflow(req.scope).run({
      input: { ids },
    })
    res.json(payload)
  } catch (error) {
    res.status(500).json({
      success: false,
      error: formatError(error),
    })
  }
}
