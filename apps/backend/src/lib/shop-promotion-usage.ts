import { MedusaContainer } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { CUSTOM_ORDER_MODULE } from "../modules/custom-order"
import type CustomOrderModuleService from "../modules/custom-order/service"
import { promotionCodesFromOrder, tallyPromotionUses } from "./shop-promotion"

export async function loadShopPromotionUsage(container: MedusaContainer) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
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
    const custom: CustomOrderModuleService = container.resolve(
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
