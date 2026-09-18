import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import type { IPromotionModuleService } from "@medusajs/framework/types"
import {
  parseShopPromotionUpdate,
  presentShopPromotion,
} from "../../../../lib/shop-promotion"

export async function POST(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) {
  const parsed = parseShopPromotionUpdate(req.body)
  if ("error" in parsed) {
    res.status(400).json({ message: parsed.error })
    return
  }
  const promotion: IPromotionModuleService = req.scope.resolve(
    Modules.PROMOTION
  )
  await promotion.updatePromotions({
    id: req.params.id,
    ...(parsed.status ? { status: parsed.status } : {}),
    ...(parsed.application_method
      ? { application_method: parsed.application_method }
      : {}),
  })
  const row = (await promotion.retrievePromotion(req.params.id, {
    relations: ["application_method"],
  })) as unknown as Record<string, unknown>
  res.json({
    promotion: presentShopPromotion(row),
  })
}
