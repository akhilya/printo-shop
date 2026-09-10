import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import {
  parseCustomOrderStatus,
  presentCustomOrder,
} from "../../../../lib/custom-order"
import { CUSTOM_ORDER_MODULE } from "../../../../modules/custom-order"
import type CustomOrderModuleService from "../../../../modules/custom-order/service"

export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) {
  const service: CustomOrderModuleService = req.scope.resolve(CUSTOM_ORDER_MODULE)
  try {
    const order = await service.retrieveCustomOrder(String(req.params.id || ""))
    res.json({
      order: presentCustomOrder(order as unknown as Record<string, unknown>),
    })
  } catch {
    res.status(404).json({ message: "Заявка не найдена" })
  }
}

export async function POST(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) {
  const id = String(req.params.id || "")
  const status = parseCustomOrderStatus(req.body)
  if (typeof status !== "string") {
    res.status(400).json({ message: status.error })
    return
  }
  const service: CustomOrderModuleService = req.scope.resolve(CUSTOM_ORDER_MODULE)
  try {
    await service.retrieveCustomOrder(id)
  } catch {
    res.status(404).json({ message: "Заявка не найдена" })
    return
  }
  const updated = await service.updateCustomOrders({
    id,
    status,
  })
  const order = Array.isArray(updated) ? updated[0] : updated
  res.json({
    order: presentCustomOrder(
      (order || { id, status }) as unknown as Record<string, unknown>
    ),
  })
}

export async function DELETE(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) {
  const id = String(req.params.id || "")
  const service: CustomOrderModuleService = req.scope.resolve(CUSTOM_ORDER_MODULE)
  try {
    await service.retrieveCustomOrder(id)
  } catch {
    res.status(404).json({ message: "Заявка не найдена" })
    return
  }
  await service.deleteCustomOrders(id)
  res.json({ id, deleted: true })
}
