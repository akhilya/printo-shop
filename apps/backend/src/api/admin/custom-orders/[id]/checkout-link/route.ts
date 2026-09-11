import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import {
  parseCustomOrderQuote,
  presentCustomOrder,
} from "../../../../../lib/custom-order"
import { newCheckoutToken } from "../../../../../lib/custom-order-pay"
import { ensureCustomShopNumber } from "../../../../../lib/shop-order-number"
import { CUSTOM_ORDER_MODULE } from "../../../../../modules/custom-order"
import type CustomOrderModuleService from "../../../../../modules/custom-order/service"

export async function POST(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) {
  const id = String(req.params.id || "")
  const parsed = parseCustomOrderQuote(req.body)
  if ("error" in parsed) {
    res.status(400).json({ message: parsed.error })
    return
  }
  const service: CustomOrderModuleService = req.scope.resolve(CUSTOM_ORDER_MODULE)
  let current: Record<string, unknown>
  try {
    current = (await service.retrieveCustomOrder(id)) as unknown as Record<
      string,
      unknown
    >
  } catch {
    res.status(404).json({ message: "Заявка не найдена" })
    return
  }
  if (current.paid_at) {
    res.status(400).json({ message: "Заказ уже оплачен" })
    return
  }
  const token = String(current.checkout_token || "").trim() || newCheckoutToken()
  const status =
    current.status === "closed" || current.status === "paid"
      ? String(current.status)
      : "quoted"
  const number = await ensureCustomShopNumber(req.scope, current)
  const updated = await service.updateCustomOrders({
    id,
    ...parsed,
    checkout_token: token,
    shop_number: number,
    status,
  })
  const order = Array.isArray(updated) ? updated[0] : updated
  res.json({
    order: presentCustomOrder(
      (order || {
        ...current,
        ...parsed,
        checkout_token: token,
        shop_number: number,
        status,
      }) as Record<string, unknown>
    ),
  })
}
