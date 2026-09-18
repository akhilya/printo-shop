import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { clientIp } from "../../../../../lib/client-ip"
import {
  parseOrderMessageInput,
  submitOrderMessage,
} from "../../../../../lib/order-message"
import { checkSubmitLimit } from "../../../../../lib/submit-limit"
import { shopOrderQueryToken } from "../../../../../lib/shop-order-number"

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const limit = checkSubmitLimit(`order-message:${clientIp(req)}`)
  if ("error" in limit) {
    res.status(429).json({ message: limit.error })
    return
  }
  const parsed = parseOrderMessageInput(req.body)
  if ("error" in parsed) {
    res.status(400).json({ message: parsed.error })
    return
  }
  const number = String(req.params.number || "").trim()
  const result = await submitOrderMessage(
    req.scope,
    number,
    parsed,
    shopOrderQueryToken(req.query)
  )
  if ("error" in result) {
    res.status(result.status ?? 400).json({ message: result.error })
    return
  }
  res.json({
    ok: true,
    message: "Письмо получили. Ответим на эту почту.",
  })
}
