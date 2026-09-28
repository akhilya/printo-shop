import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import type { IPromotionModuleService } from "@medusajs/framework/types"
import {
  presentPublicPromo,
  promotionPageFromRow,
} from "../../../../lib/shop-promotion"
import { loadShopPromotionUsage } from "../../../../lib/shop-promotion-usage"

export async function OPTIONS(_req: MedusaRequest, res: MedusaResponse) {
  res.status(204).end()
}

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const page = String(req.params.page || "").trim().toLowerCase()
  if (!/^[a-z0-9]{8,16}$/.test(page)) {
    res.json({ promo: null })
    return
  }
  try {
    const promotion: IPromotionModuleService = req.scope.resolve(
      Modules.PROMOTION
    )
    const rows = await promotion.listPromotions(
      {},
      { take: 100, relations: ["application_method"] }
    )
    const row = (rows as unknown as Record<string, unknown>[]).find(
      (item) => promotionPageFromRow(item) === page
    )
    if (!row) {
      res.json({ promo: null })
      return
    }
    const code = String(row.code || "").trim().toUpperCase()
    let used = 0
    if (row.is_automatic !== true && String(row.status || "") === "active") {
      const usage = await loadShopPromotionUsage(req.scope)
      used = usage[code] || 0
    }
    res.json({ promo: presentPublicPromo(row, used) })
  } catch {
    res.json({ promo: null })
  }
}
