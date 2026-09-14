import { MedusaContainer } from "@medusajs/framework"
import { ContainerRegistrationKeys, MedusaError, Modules } from "@medusajs/framework/utils"
import {
  completeOrderWorkflow,
  createOrderFulfillmentWorkflow,
  createOrderShipmentWorkflow,
  markOrderFulfillmentAsDeliveredWorkflow,
} from "@medusajs/medusa/core-flows"
import {
  handOverOzonForOrder,
  loadShopOrder,
  packOzonForOrder,
  syncOzonPostingForOrder,
} from "./ozon-fulfill"
import { sendShopOrderMail } from "./order-mail"
import { mailEventFromShopStatus } from "./order-mail-copy"
import { ozonReturnMessage } from "./ozon-posting"
import { orderLogContext, recordShopEvent } from "./shop-event"
import { cancelShopOrder } from "./shop-order"
import {
  type ShopFulfillment,
  shopFulfillmentOf,
} from "./shop-fulfillment-status"

export {
  SHOP_FULFILLMENTS,
  mapDelegatOrderStatus,
  mapMedusaOrderStatus,
  orderLooksPaid,
  shopFulfillmentOf,
} from "./shop-fulfillment-status"
export type { ShopFulfillment } from "./shop-fulfillment-status"

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

function activeFulfillments(order: Record<string, unknown>) {
  return ((order.fulfillments as Array<Record<string, unknown>>) || []).filter(
    (row) => row.id && !row.canceled_at && !row.cancelled_at
  )
}

function lineItems(order: Record<string, unknown>) {
  return ((order.items as Array<Record<string, unknown>>) || [])
    .filter((item) => item.id)
    .map((item) => ({
      id: String(item.id),
      quantity: Number(item.quantity || 1),
    }))
}

function ozonConfigured(order: Record<string, unknown>) {
  const metadata = (order.metadata || {}) as Record<string, unknown>
  return Boolean(
    metadata.ozon_posting_number ||
      metadata.ozon_order_number ||
      metadata.ozon_point_id
  )
}

async function stockLocationId(container: MedusaContainer) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "stock_location",
    fields: ["id"],
  })
  return String((data ?? [])[0]?.id || "")
}

async function ensureCompleted(
  container: MedusaContainer,
  order: Record<string, unknown>
) {
  if (order.status === "pending" || order.status === "requires_action") {
    try {
      await completeOrderWorkflow(container).run({
        input: { orderIds: [String(order.id)] },
      })
    } catch {
      // Status mapping still treats a paid pending order as packing.
    }
  }
}

async function ensureNativeFulfillment(
  container: MedusaContainer,
  order: Record<string, unknown>
) {
  const existing = activeFulfillments(order)
  if (existing[0]?.id) return String(existing[0].id)
  const items = lineItems(order)
  if (!items.length) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "В заказе нет позиций для сборки"
    )
  }
  const locationId = await stockLocationId(container)
  const { result } = await createOrderFulfillmentWorkflow(container).run({
    input: {
      order_id: String(order.id),
      items,
      location_id: locationId || undefined,
      no_notification: true,
    },
  })
  const fulfillment = result as { id?: string } | Array<{ id?: string }>
  const row = Array.isArray(fulfillment) ? fulfillment[0] : fulfillment
  return String(row?.id || "")
}

async function ensureNativeShipment(
  container: MedusaContainer,
  order: Record<string, unknown>,
  fulfillmentId: string
) {
  const current = activeFulfillments(order).find(
    (row) => String(row.id) === fulfillmentId
  )
  if (current?.shipped_at) return
  const metadata = (order.metadata || {}) as Record<string, unknown>
  const labelUrl = metadata.ozon_label_url
    ? String(metadata.ozon_label_url)
    : ""
  const tracking = metadata.ozon_tracking
    ? String(metadata.ozon_tracking)
    : ""
  const posting = metadata.ozon_posting_number
    ? String(metadata.ozon_posting_number)
    : metadata.ozon_order_number
      ? String(metadata.ozon_order_number)
      : ""
  await createOrderShipmentWorkflow(container).run({
    input: {
      order_id: String(order.id),
      fulfillment_id: fulfillmentId,
      items: lineItems(order),
      no_notification: true,
      labels:
        labelUrl || tracking
          ? [
              {
                tracking_number: posting || String(order.id),
                tracking_url: tracking || labelUrl,
                label_url: labelUrl || tracking,
              },
            ]
          : undefined,
    },
  })
}

async function ensureNativeDelivered(
  container: MedusaContainer,
  order: Record<string, unknown>,
  fulfillmentId: string
) {
  const current = activeFulfillments(order).find(
    (row) => String(row.id) === fulfillmentId
  )
  if (current?.delivered_at) return
  await markOrderFulfillmentAsDeliveredWorkflow(container).run({
    input: {
      orderId: String(order.id),
      fulfillmentId,
      no_notification: true,
    },
  })
  const orderModule = container.resolve(Modules.ORDER) as OrderModule
  if (typeof orderModule.archive === "function") {
    try {
      await orderModule.archive([String(order.id)])
    } catch {
      // Metadata / fulfillment timestamps are enough.
    }
  }
}

function ozonStatusTitle(mapped: string | null, kind: string | null) {
  if (kind === "unclaimed") return "Не забрали на ПВЗ"
  if (kind === "refused") return "Отказ на пункте выдачи"
  if (kind === "returned" || mapped === "returned") return "Возврат Ozon"
  if (mapped === "delivered") return "Заказ получен"
  if (mapped === "delivering") return "Заказ доставляется"
  if (mapped === "awaiting_deliver") return "Готов к сдаче в Ozon"
  if (mapped === "cancelled") return "Отправление Ozon отменено"
  return "Статус Ozon обновился"
}

export async function applyOzonStatusToFulfillment(
  container: MedusaContainer,
  orderId: string
) {
  const synced = await syncOzonPostingForOrder(container, orderId)
  if (!synced) return synced
  if (synced.changed) {
    const kind = synced.kind || null
    await recordShopEvent(container, {
      kind: kind ? `ozon_${kind}` : "ozon_status",
      level: kind || synced.mapped === "cancelled" ? "warn" : "info",
      title: ozonStatusTitle(synced.mapped, kind),
      message:
        ozonReturnMessage(kind) ||
        `Ozon: ${synced.previousRaw || "—"} → ${synced.posting.status || "—"}`,
      ...orderLogContext(synced.order),
      from_status: synced.previousRaw || null,
      to_status: synced.posting.status || synced.mapped,
    })
  }
  if (!synced.mapped) return synced
  const order = synced.order
  if (synced.mapped === "delivering" || synced.mapped === "delivered") {
    const fulfillmentId = await ensureNativeFulfillment(container, order)
    const fresh = (await loadShopOrder(container, orderId)) || order
    await ensureNativeShipment(container, fresh, fulfillmentId)
  }
  if (synced.mapped === "delivered") {
    const fresh = (await loadShopOrder(container, orderId)) || order
    const fulfillmentId = String(activeFulfillments(fresh)[0]?.id || "")
    if (fulfillmentId) {
      await ensureNativeDelivered(container, fresh, fulfillmentId)
    }
  }
  if (synced.changed) {
    const mailEvent = mailEventFromShopStatus(synced.mapped)
    if (mailEvent) {
      await sendShopOrderMail(container, orderId, mailEvent)
    }
  }
  return synced
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
  const order = await loadShopOrder(container, orderId)
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
  if (next === "awaiting_pack") {
    return { id: orderId, fulfillment: shopFulfillmentOf(order) || "awaiting_pack" }
  }
  await ensureCompleted(container, order)
  if (next === "delivered" && ozonConfigured(order)) {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "Статус «доставлен» ставит Ozon, когда покупатель забирает заказ"
    )
  }
  if (next === "awaiting_deliver") {
    await ensureNativeFulfillment(container, order)
    await packOzonForOrder(container, orderId)
  } else if (next === "delivering") {
    const fulfillmentId = await ensureNativeFulfillment(container, order)
    await packOzonForOrder(container, orderId).catch(() => null)
    const packed = (await loadShopOrder(container, orderId)) || order
    await ensureNativeShipment(container, packed, fulfillmentId)
    await handOverOzonForOrder(container, orderId)
  } else if (next === "delivered") {
    const fulfillmentId = await ensureNativeFulfillment(container, order)
    const packed = (await loadShopOrder(container, orderId)) || order
    await ensureNativeShipment(container, packed, fulfillmentId)
    const shipped = (await loadShopOrder(container, orderId)) || packed
    await ensureNativeDelivered(container, shipped, fulfillmentId)
  }
  const updated = await loadShopOrder(container, orderId)
  const mailEvent = mailEventFromShopStatus(next)
  if (mailEvent) {
    await sendShopOrderMail(container, orderId, mailEvent)
  }
  return {
    id: orderId,
    fulfillment: updated ? shopFulfillmentOf(updated) || next : next,
  }
}
