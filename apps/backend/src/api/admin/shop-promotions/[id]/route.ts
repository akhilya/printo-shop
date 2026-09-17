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
  const existing = (await promotion.retrievePromotion(req.params.id, {
    relations: ["application_method"],
  })) as unknown as Record<string, unknown>
  const updated = await promotion.updatePromotions({
    id: req.params.id,
    application_method: {
      target_type: parsed.application_method.target_type,
    },
  })
  const row = Array.isArray(updated) ? updated[0] : updated
  res.json({
    promotion: presentShopPromotion(
      (row || existing) as unknown as Record<string, unknown>
    ),
  })
}
