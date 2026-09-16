import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import type { IPromotionModuleService } from "@medusajs/framework/types"
import { presentCatalogSales } from "../../../lib/catalog-sales"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  try {
    const promotion: IPromotionModuleService = req.scope.resolve(
      Modules.PROMOTION
    )
    const rows = await promotion.listPromotions(
      { status: ["active"], is_automatic: true },
      {
        take: 50,
        relations: [
          "application_method",
          "application_method.target_rules",
          "application_method.target_rules.values",
          "campaign",
        ],
      }
    )
    res.json({
      sales: presentCatalogSales(rows as unknown as Record<string, unknown>[]),
    })
  } catch {
    res.json({ sales: [] })
  }
}
