import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import type { IPromotionModuleService } from "@medusajs/framework/types"
import { presentCatalogSales } from "../../../lib/catalog-sales"

export async function OPTIONS(_req: MedusaRequest, res: MedusaResponse) {
  res.status(204).end()
}

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
    res.setHeader(
      "Cache-Control",
      "public, max-age=60, stale-while-revalidate=600"
    )
    res.json({
      sales: presentCatalogSales(rows as unknown as Record<string, unknown>[]),
    })
  } catch {
    res.json({ sales: [] })
  }
}
