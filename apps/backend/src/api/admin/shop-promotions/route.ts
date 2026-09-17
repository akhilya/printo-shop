import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import type { IPromotionModuleService } from "@medusajs/framework/types"
import {
  parseShopPromotionCreate,
  presentShopPromotion,
} from "../../../lib/shop-promotion"

export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) {
  const promotion: IPromotionModuleService = req.scope.resolve(
    Modules.PROMOTION
  )
  const rows = await promotion.listPromotions(
    {},
    {
      take: 100,
      order: { created_at: "DESC" },
      relations: ["application_method"],
    }
  )
  res.json({
    promotions: (rows as unknown as Record<string, unknown>[]).map(
      presentShopPromotion
    ),
  })
}

export async function POST(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) {
  const parsed = parseShopPromotionCreate(req.body)
  if ("error" in parsed) {
    res.status(400).json({ message: parsed.error })
    return
  }
  const promotion: IPromotionModuleService = req.scope.resolve(
    Modules.PROMOTION
  )
  try {
    const created = await promotion.createPromotions([parsed])
    const row = Array.isArray(created) ? created[0] : created
    res.status(201).json({
      promotion: presentShopPromotion(
        (row || {}) as unknown as Record<string, unknown>
      ),
    })
  } catch {
    res.status(400).json({ message: "Такой промокод уже есть" })
  }
}
