import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { presentShopEvent } from "../../../../lib/shop-event"
import { SHOP_EVENT_MODULE } from "../../../../modules/shop-event"
import type ShopEventModuleService from "../../../../modules/shop-event/service"

export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) {
  const id = String(req.params.id || "")
  const service: ShopEventModuleService = req.scope.resolve(SHOP_EVENT_MODULE)
  try {
    const row = await service.retrieveShopEvent(id)
    res.json({
      log: presentShopEvent(row as unknown as Record<string, unknown>),
    })
  } catch {
    res.status(404).json({ message: "Запись не найдена" })
  }
}
