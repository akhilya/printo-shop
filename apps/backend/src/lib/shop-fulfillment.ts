import { MedusaContainer } from "@medusajs/framework"
import { ContainerRegistrationKeys, MedusaError, Modules } from "@medusajs/framework/utils"
import { cancelShopOrder } from "./shop-order"

export const SHOP_FULFILLMENTS = [
  "awaiting_pack",
  "delivering",
  "delivered",
] as const

export type ShopFulfillment = (typeof SHOP_FULFILLMENTS)[number]

export function shopFulfillmentOf(order: Record<string, unknown>) {
  const metadata = (order.metadata || {}) as Record<string, unknown>
  const value = String(metadata.shop_fulfillment || "").trim()
  if (SHOP_FULFILLMENTS.includes(value as ShopFulfillment)) {
    return value as ShopFulfillment
  }
  return null
}

export function mapMedusaOrderStatus(
  status: string,
  fulfillment?: string | null
) {
  switch (status) {
    case "canceled":
      return "cancelled"
    case "archived":
      return "delivered"
    case "pending":
    case "requires_action":
    case "draft":
      return "unpaid"
    case "completed":
      if (fulfillment === "delivered") return "delivered"
      if (fulfillment === "delivering") return "delivering"
      return "awaiting_pack"
    default:
      return "unknown"
  }
}

export function mapDelegatOrderStatus(order: Record<string, unknown>) {
  return mapMedusaOrderStatus(String(order.status || ""), shopFulfillmentOf(order))
}

function fulfillmentFromAction(action: string): ShopFulfillment | "cancel" | null {
  switch (String(action || "").trim().toLowerCase()) {
    case "pack":
    case "confirm":
      return "awaiting_pack"
    case "ship":
      return "delivering"
    case "deliver":
    case "complete":
      return "delivered"
    case "cancel":
      return "cancel"
    default:
      return null
  }
}

async function saveOrderMetadata(
  container: MedusaContainer,
  orderId: string,
  metadata: Record<string, unknown>
) {
  const orderModule = container.resolve(Modules.ORDER) as {
    updateOrders?: (data: unknown) => Promise<unknown>
    update?: (id: string, data: unknown) => Promise<unknown>
    archive?: (ids: string[] | string) => Promise<unknown>
  }
  if (typeof orderModule.updateOrders === "function") {
    await orderModule.updateOrders({ id: orderId, metadata })
    return orderModule
  }
  if (typeof orderModule.update === "function") {
    await orderModule.update(orderId, { metadata })
  }
  return orderModule
}

export async function applyShopOrderAction(
  container: MedusaContainer,
  orderId: string,
  action: string
) {
  const next = fulfillmentFromAction(action)
  if (!next) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Неизвестное действие по заказу"
    )
  }
  if (next === "cancel") {
    return cancelShopOrder(container, orderId, true)
  }
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "order",
    fields: ["id", "status", "metadata"],
    filters: { id: orderId },
  })
  const order = ((data ?? [])[0] || null) as Record<string, unknown> | null
  if (!order) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, "order_not_found")
  }
  if (order.status === "canceled") {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "Заказ уже отменён"
    )
  }
  const metadata = {
    ...((order.metadata || {}) as Record<string, unknown>),
    shop_fulfillment: next,
  }
  const orderModule = await saveOrderMetadata(container, orderId, metadata)
  if (next === "delivered" && typeof orderModule.archive === "function") {
    try {
      await orderModule.archive([orderId])
    } catch {
      // Metadata is enough if archive is unavailable.
    }
  }
  return { id: orderId, fulfillment: next }
}
