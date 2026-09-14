import { mapOzonPostingStatus } from "./ozon-posting"

export const SHOP_FULFILLMENTS = [
  "awaiting_pack",
  "awaiting_deliver",
  "delivering",
  "delivered",
  "returned",
] as const

export type ShopFulfillment = (typeof SHOP_FULFILLMENTS)[number]

const RANK: Record<string, number> = {
  awaiting_pack: 1,
  awaiting_deliver: 2,
  delivering: 3,
  delivered: 4,
  returned: 5,
  cancelled: 5,
}

function laterStage(...values: Array<string | null | undefined>) {
  let picked: string | null = null
  for (const value of values) {
    if (!value) continue
    if (!picked || (RANK[value] || 0) >= (RANK[picked] || 0)) {
      picked = value
    }
  }
  return picked
}

function nativeFulfillmentOf(order: Record<string, unknown>) {
  const rows = ((order.fulfillments as Array<Record<string, unknown>>) || []).filter(
    (row) => !row.canceled_at && !row.cancelled_at
  )
  if (!rows.length) return null
  if (rows.some((row) => row.delivered_at)) return "delivered"
  if (rows.some((row) => row.shipped_at)) return "delivering"
  return "awaiting_deliver"
}

export function shopFulfillmentOf(order: Record<string, unknown>) {
  const metadata = (order.metadata || {}) as Record<string, unknown>
  const returnKind = String(metadata.ozon_return_kind || "").trim()
  const fromOzon = ["unclaimed", "refused", "returned"].includes(returnKind)
    ? "returned"
    : mapOzonPostingStatus(
        metadata.ozon_posting_status
          ? String(metadata.ozon_posting_status)
          : null
      )
  const fromNative = nativeFulfillmentOf(order)
  const legacy = String(metadata.shop_fulfillment || "").trim()
  const fromLegacy = SHOP_FULFILLMENTS.includes(legacy as ShopFulfillment)
    ? (legacy as ShopFulfillment)
    : null
  const picked = laterStage(fromLegacy, fromNative, fromOzon)
  if (picked && SHOP_FULFILLMENTS.includes(picked as ShopFulfillment)) {
    return picked as ShopFulfillment
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
  if (fulfillment === "returned") return "returned"
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
