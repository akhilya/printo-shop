import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import {
  createOzonDeliveryOrder,
  extractOzonCreateIds,
  ozonCredsFromRow,
} from "../lib/ozon-delivery"
import { recordShopEvent } from "../lib/shop-event"
import { getShopSetting } from "../lib/shop-setting"

function money(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (value && typeof value === "object") {
    const rec = value as { numeric?: unknown }
    if (typeof rec.numeric === "number") return rec.numeric
  }
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : 0
}

export default async function orderPlacedOzon({
  event,
  container,
}: SubscriberArgs<{ id: string }>) {
  const orderId = event.data.id
  const row = (await getShopSetting(container)) as unknown as Record<string, unknown>
  const creds = ozonCredsFromRow(row)
  if (!creds) return

  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "order",
    fields: [
      "id",
      "display_id",
      "email",
      "total",
      "metadata",
      "items.title",
      "items.quantity",
      "items.unit_price",
      "items.variant.sku",
      "items.variant.product.title",
      "shipping_address.first_name",
      "shipping_address.last_name",
      "shipping_address.phone",
      "shipping_address.address_1",
      "shipping_address.address_2",
      "shipping_address.company",
    ],
    filters: { id: orderId },
  })
  const order = ((data ?? [])[0] || null) as Record<string, unknown> | null
  if (!order) return
  const metadata = (order.metadata || {}) as Record<string, unknown>
  const address = (order.shipping_address || {}) as Record<string, unknown>
  const pointId = String(metadata.ozon_point_id || address.company || "")
  if (!pointId) return

  const name =
    [address.first_name, address.last_name].filter(Boolean).join(" ").trim() ||
    "Покупатель"
  const phone = String(address.phone || "")
  const items = ((order.items as Array<Record<string, unknown>>) || []).map(
    (item) => {
      const variant = (item.variant || {}) as Record<string, unknown>
      const product = (variant.product || {}) as Record<string, unknown>
      return {
        article: String(variant.sku || item.id || "sku"),
        name: String(product.title || item.title || "Товар"),
        quantity: Number(item.quantity || 1),
        price: money(item.unit_price),
      }
    }
  )
  const orderModule = container.resolve(Modules.ORDER) as {
    updateOrders: (
      id: string,
      data: { metadata: Record<string, unknown> }
    ) => Promise<unknown>
  }

  async function saveMeta(next: Record<string, unknown>) {
    await orderModule.updateOrders(orderId, { metadata: next })
  }

  try {
    const created = await createOzonDeliveryOrder({
      creds,
      orderNumber: String(
        metadata.shop_number || order.display_id || order.id
      ),
      buyer: {
        name,
        phone,
        email: order.email ? String(order.email) : undefined,
      },
      point: {
        id: pointId,
        address: String(
          metadata.ozon_point_address || address.address_1 || ""
        ),
      },
      amount: money(order.total),
      items,
    })
    const ids = extractOzonCreateIds(created)
    await saveMeta({
      ...metadata,
      ozon_order_number: ids.orderNumber,
      ozon_posting_number: ids.postingNumber,
      ozon_tracking: ids.trackingUrl,
      ozon_create_error: null,
      ozon_create_raw: JSON.stringify(created).slice(0, 2000),
    })
    await recordShopEvent(container, {
      kind: "ozon_create",
      title: "Отправление создано в Ozon",
      message: ids.postingNumber
        ? `Номер отправления ${ids.postingNumber}`
        : "Ozon принял заказ",
      order_id: orderId,
      shop_number: metadata.shop_number
        ? String(metadata.shop_number)
        : null,
      posting_number: ids.postingNumber,
    })
  } catch (error) {
    const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
    const message = error instanceof Error ? error.message : String(error)
    logger.warn(`Ozon order create failed for ${orderId}: ${message}`)
    await recordShopEvent(container, {
      kind: "ozon_create",
      level: "error",
      title: "Не удалось создать отправление Ozon",
      message,
      order_id: orderId,
      shop_number: metadata.shop_number
        ? String(metadata.shop_number)
        : null,
    })
    try {
      await saveMeta({
        ...metadata,
        ozon_create_error: message.slice(0, 500),
      })
    } catch {
      // Metadata write is best-effort after a failed create.
    }
  }
}

export const config: SubscriberConfig = {
  event: "order.placed",
}
