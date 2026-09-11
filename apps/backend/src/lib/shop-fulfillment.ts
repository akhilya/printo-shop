import { MedusaContainer } from "@medusajs/framework"
import { ContainerRegistrationKeys, MedusaError, Modules } from "@medusajs/framework/utils"
import { completeOrderWorkflow } from "@medusajs/medusa/core-flows"
import { cancelShopOrder } from "./shop-order"

export const SHOP_FULFILLMENTS = [
  "awaiting_pack",
  "awaiting_deliver",
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

const PAID_COLLECTION_STATUSES = new Set([
  "authorized",
  "captured",
  "completed",
  "partially_captured",
  "partially_authorized",
])

const PAID_PAYMENT_STATUSES = new Set([
  "authorized",
  "captured",
  "partially_captured",
  "partially_refunded",
])

export function orderLooksPaid(order: Record<string, unknown>) {
  const paymentStatus = String(order.payment_status || "").toLowerCase()
  if (PAID_PAYMENT_STATUSES.has(paymentStatus)) return true
  const collections =
    (order.payment_collections as Array<Record<string, unknown>>) || []
  for (const collection of collections) {
    if (PAID_COLLECTION_STATUSES.has(String(collection.status || "").toLowerCase())) {
      return true
    }
    const payments = (collection.payments as Array<Record<string, unknown>>) || []
    for (const payment of payments) {
      const captures = (payment.captures as unknown[]) || []
      if (captures.length || payment.captured_at) return true
    }
  }
  return false
}

export function mapMedusaOrderStatus(
  status: string,
  fulfillment?: string | null,
  paid?: boolean
) {
  switch (status) {
    case "canceled":
      return "cancelled"
    case "archived":
      return "delivered"
    case "pending":
    case "requires_action":
    case "draft":
      if (!paid) return "unpaid"
      if (fulfillment === "delivered") return "delivered"
      if (fulfillment === "delivering") return "delivering"
      if (fulfillment === "awaiting_deliver") return "awaiting_deliver"
      return "awaiting_pack"
    case "completed":
      if (fulfillment === "delivered") return "delivered"
      if (fulfillment === "delivering") return "delivering"
      if (fulfillment === "awaiting_deliver") return "awaiting_deliver"
      return "awaiting_pack"
    default:
      return "unknown"
  }
}

export function mapDelegatOrderStatus(order: Record<string, unknown>) {
  return mapMedusaOrderStatus(
    String(order.status || ""),
    shopFulfillmentOf(order),
    orderLooksPaid(order)
  )
}

function fulfillmentFromAction(action: string): ShopFulfillment | "cancel" | null {
  switch (String(action || "").trim().toLowerCase()) {
    case "confirm":
      return "awaiting_pack"
    case "pack":
      return "awaiting_deliver"
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

type OrderModule = {
  updateOrders: (
    id: string,
    data: { metadata: Record<string, unknown> }
  ) => Promise<unknown>
  archive?: (ids: string[] | string) => Promise<unknown>
}

export async function saveOrderMetadata(
  container: MedusaContainer,
  orderId: string,
  metadata: Record<string, unknown>
) {
  const orderModule = container.resolve(Modules.ORDER) as OrderModule
  await orderModule.updateOrders(orderId, { metadata })
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
    fields: [
      "id",
      "status",
      "metadata",
      "payment_collections.status",
      "payment_collections.payments.captured_at",
      "payment_collections.payments.captures.id",
    ],
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
  const paid =
    orderLooksPaid(order) ||
    order.status === "completed" ||
    order.status === "archived"
  if (!paid) {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "Заказ ещё не оплачен"
    )
  }
  if (order.status === "pending" || order.status === "requires_action") {
    try {
      await completeOrderWorkflow(container).run({
        input: { orderIds: [orderId] },
      })
    } catch {
      // Status mapping still treats a paid pending order as packing.
    }
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
