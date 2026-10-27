import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { getShopSetting, parseGiftCardDenominations } from "../../../lib/shop-setting"
import { newCheckoutToken } from "../../../lib/custom-order-pay"
import { clientIp } from "../../../lib/client-ip"
import { checkSubmitLimit } from "../../../lib/submit-limit"
import { ensureCustomShopNumber } from "../../../lib/shop-order-lookup"
import { createGiftCardOrderWorkflow } from "../../../workflows/create-gift-card-order"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const settings = (await getShopSetting(req.scope)) as unknown as Record<
    string,
    unknown
  >
  res.json({ denominations: parseGiftCardDenominations(settings.gift_card_denominations) })
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const limit = checkSubmitLimit(`gift-card:${clientIp(req)}`)
  if ("error" in limit) {
    res.status(429).json({ message: limit.error })
    return
  }

  const settings = (await getShopSetting(req.scope)) as unknown as Record<
    string,
    unknown
  >
  const denominations = parseGiftCardDenominations(
    settings.gift_card_denominations
  )
  const body = req.body as Record<string, unknown> | undefined
  const amount = Number(body?.amount)
  const email = String(body?.email || "").trim().toLowerCase()
  if (!denominations.includes(amount)) {
    res.status(400).json({ message: "Выберите доступный номинал сертификата" })
    return
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    res.status(400).json({ message: "Проверьте адрес почты" })
    return
  }

  const checkoutToken = newCheckoutToken()
  const { result: order } = await createGiftCardOrderWorkflow(req.scope).run({
    input: { amount, email, token: checkoutToken, ip: clientIp(req) },
  })
  await ensureCustomShopNumber(req.scope, order)
  res.status(201).json({ token: checkoutToken, order_id: order.id })
}
