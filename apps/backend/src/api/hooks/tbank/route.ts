import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules, PaymentWebhookEvents } from "@medusajs/framework/utils"

/**
 * T-Bank NotificationURL. Must respond with the literal body "OK".
 * Processing is delayed via the same bus as /hooks/payment/:provider.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  try {
    const eventBus = req.scope.resolve(Modules.EVENT_BUS)
    await eventBus.emit(
      {
        name: PaymentWebhookEvents.WebhookReceived,
        data: {
          provider: "tbank_tbank",
          payload: {
            data: req.body,
            rawData: (req as MedusaRequest & { rawBody?: string }).rawBody,
            headers: req.headers,
          },
        },
      },
      { delay: 1000, attempts: 3 }
    )
  } catch (error) {
    res.status(400).send("Webhook Error")
    return
  }

  res.status(200).type("text/plain").send("OK")
}
