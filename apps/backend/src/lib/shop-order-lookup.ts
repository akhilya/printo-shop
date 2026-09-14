import { MedusaContainer } from "@medusajs/framework"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { CUSTOM_ORDER_MODULE } from "../modules/custom-order"
import type CustomOrderModuleService from "../modules/custom-order/service"
import {
  ensureCustomShopNumber,
  ensureMedusaShopNumber,
  findShopOrderLookup,
} from "./shop-order-number"
import {
  presentShopOrderFromCustom,
  presentShopOrderFromMedusa,
} from "./shop-order-view"

const ORDER_FIELDS = [
  "id",
  "display_id",
  "email",
  "status",
  "total",
  "currency_code",
  "created_at",
  "metadata",
  "items.title",
  "items.quantity",
  "items.unit_price",
  "items.thumbnail",
  "items.variant.sku",
  "shipping_address.address_1",
  "shipping_address.address_2",
  "shipping_address.city",
  "fulfillments.id",
  "fulfillments.canceled_at",
  "fulfillments.shipped_at",
  "fulfillments.delivered_at",
  "payment_collections.status",
  "payment_collections.payments.captured_at",
  "payment_collections.payments.captures.id",
]

export async function loadShopOrderByNumber(
  container: MedusaContainer,
  number: string
) {
  const lookup = await findShopOrderLookup(container, number)
  if (!lookup) return null
  const source = String(lookup.source || "")
  const refId = String(lookup.ref_id || "")
  if (source === "custom") {
    const service: CustomOrderModuleService =
      container.resolve(CUSTOM_ORDER_MODULE)
    let row: Record<string, unknown>
    try {
      row = (await service.retrieveCustomOrder(refId)) as unknown as Record<
        string,
        unknown
      >
    } catch {
      return null
    }
    let product: { title?: string | null; thumbnail?: string | null } | null =
      null
    const productId = String(row.product_id || "").trim()
    if (productId) {
      try {
        const productModule = container.resolve(Modules.PRODUCT) as {
          retrieveProduct: (
            id: string,
            config?: { select?: string[] }
          ) => Promise<{ title?: string | null; thumbnail?: string | null }>
        }
        product = await productModule.retrieveProduct(productId, {
          select: ["id", "title", "thumbnail"],
        })
      } catch {
        product = null
      }
    }
    return presentShopOrderFromCustom(row, number, product)
  }
  if (source === "order") {
    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const { data } = await query.graph({
      entity: "order",
      fields: ORDER_FIELDS,
      filters: { id: refId },
    })
    const order = ((data ?? [])[0] || null) as Record<string, unknown> | null
    if (!order) return null
    return presentShopOrderFromMedusa(order, number)
  }
  return null
}

export { ensureCustomShopNumber, ensureMedusaShopNumber }
