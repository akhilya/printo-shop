import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import type { IPromotionModuleService } from "@medusajs/framework/types"
import {
  parseShopPromotionCreate,
  presentShopPromotion,
  promotionCodesFromOrder,
  tallyPromotionUses,
} from "../../../lib/shop-promotion"
import { CUSTOM_ORDER_MODULE } from "../../../modules/custom-order"
import type CustomOrderModuleService from "../../../modules/custom-order/service"

async function usageByPromoCode(req: AuthenticatedMedusaRequest) {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const codeLists: string[][] = []
  const page = 200
  for (let skip = 0; skip < 2000; skip += page) {
    const { data } = await query.graph({
      entity: "order",
      fields: [
        "id",
        "promotions.code",
        "items.adjustments.code",
        "shipping_methods.adjustments.code",
      ],
      pagination: { skip, take: page },
    })
    const rows = (data || []) as Record<string, unknown>[]
    if (!rows.length) break
    for (const order of rows) {
      codeLists.push(promotionCodesFromOrder(order))
    }
    if (rows.length < page) break
  }
  try {
    const custom: CustomOrderModuleService = req.scope.resolve(
      CUSTOM_ORDER_MODULE
    )
    const rows = await custom.listCustomOrders({}, { take: 1000, skip: 0 })
    for (const row of rows as unknown as Record<string, unknown>[]) {
      const code = String(row.promo_code || "").trim()
      if (code) codeLists.push([code])
    }
  } catch {
    // custom orders are optional for the discounts list
  }
  return tallyPromotionUses(codeLists)
}

export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) {
  const promotion: IPromotionModuleService = req.scope.resolve(
    Modules.PROMOTION
  )
  const [rows, usageByCode] = await Promise.all([
    promotion.listPromotions(
      {},
      {
        take: 100,
        order: { created_at: "DESC" },
        relations: ["application_method"],
      }
    ),
    usageByPromoCode(req),
  ])
  res.json({
    promotions: (rows as unknown as Record<string, unknown>[]).map((row) =>
      presentShopPromotion(row, usageByCode)
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
