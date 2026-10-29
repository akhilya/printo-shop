import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { retryOzonOrderCreationWorkflow } from "../../../../../workflows/retry-ozon-order-creation"

export async function POST(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) {
  try {
    const provider = (req.body as { provider?: unknown } | undefined)?.provider
    if (provider != null && provider !== "delivery_api") {
      res.status(400).json({
        success: false,
        message: "Неизвестный способ создания отправления Ozon",
      })
      return
    }
    const { result } = await retryOzonOrderCreationWorkflow(req.scope).run({
      input: {
        orderId: req.params.id,
        ...(provider === "delivery_api" ? { provider } : {}),
      },
    })

    if (result.status === "skipped") {
      res.status(409).json({ success: false, message: result.message })
      return
    }
    if (result.status === "failed") {
      res.status(502).json({ success: false, message: result.message })
      return
    }

    res.json({ success: true, message: result.message })
  } catch (error) {
    res.status(500).json({
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "Не удалось повторить создание отправления Ozon",
    })
  }
}
