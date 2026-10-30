import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { clientIp } from "../../../../../lib/client-ip"
import { normalizeShopOrderContact } from "../../../../../lib/shop-order-access"
import { checkSubmitLimit } from "../../../../../lib/submit-limit"
import { issueShopOrderAccessWorkflow } from "../../../../../workflows/issue-shop-order-access"

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const limit = checkSubmitLimit(`shop-order-access:${clientIp(req)}`)
  if ("error" in limit) {
    res.status(429).json({ message: "Слишком много попыток. Попробуйте позже." })
    return
  }

  const body =
    req.body && typeof req.body === "object"
      ? (req.body as Record<string, unknown>)
      : {}
  const number = String(req.params.number || "").trim()
  const contact = String(body.contact || "").trim()
  if (!/^\d{10}$/.test(number) || !normalizeShopOrderContact(contact)) {
    res.status(400).json({
      message: "Укажите почту или телефон с оформления заказа.",
    })
    return
  }

  const { result: token } = await issueShopOrderAccessWorkflow(req.scope).run({
    input: { number, contact },
  })
  if (!token) {
    res.status(404).json({
      message: "Не удалось найти заказ с этими данными. Проверьте номер и контакт.",
    })
    return
  }

  res.json({ token })
}
