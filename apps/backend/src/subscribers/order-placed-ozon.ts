import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import {
  createOzonDeliveryOrder,
  extractOzonCreateIds,
  ozonAdminErrorMessage,
  ozonCredsFromRow,
  ozonOrderItemsForCreate,
} from "../lib/ozon-delivery"
import { ensureMedusaShopNumber } from "../lib/shop-order-number"
import {
  recordShopEvent,
  shopEventErrorDetail,
  shopEventJsonDetail,
} from "../lib/shop-event"
import { getShopSetting } from "../lib/shop-setting"
import { shopOrderShipping } from "../lib/shop-order-view"

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
      "shipping_total",
      "metadata",
      "items.title",
      "items.quantity",
      "items.unit_price",
      "items.total",
      "items.subtotal",
      "items.variant_sku",
      "items.sku",
      "items.variant_id",
      "items.variant.sku",
      "items.variant.barcode",
      "items.variant.metadata",
      "items.variant.product.title",
      "items.metadata",
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
  const items = await ozonOrderItemsForCreate(
    (order.items as Array<Record<string, unknown>>) || [],
    money,
    async (ids) => {
      const productModule = container.resolve(Modules.PRODUCT)
      const rows = await productModule.listProductVariants(
        { id: ids },
        { select: ["id", "sku", "barcode", "metadata"] }
      )
      return rows.map((row) => ({
        id: row.id,
        sku: row.sku,
        barcode: row.barcode,
        metadata: (row.metadata || {}) as Record<string, unknown>,
      }))
    }
  )
  const missing = items.filter((item) => !item.article)
  if (missing.length) {
    const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
    const labels = missing.map((item) => item.name).join(", ")
    logger.warn(`Ozon order create skipped, no offer_id for ${orderId}: ${labels}`)
    await recordShopEvent(container, {
      kind: "ozon_create",
      level: "error",
      title: "Не удалось создать отправление Ozon",
      message: `Нет артикула Ozon у позиций: ${labels}`,
      detail: shopEventJsonDetail({
        items,
        hint: "items.variant_sku",
      }),
      order_id: orderId,
      shop_number: metadata.shop_number
        ? String(metadata.shop_number)
        : order.display_id
          ? String(order.display_id)
          : null,
    })
    return
  }
  const shopNumber =
    (await ensureMedusaShopNumber(container, orderId)) ||
    (metadata.shop_number ? String(metadata.shop_number) : null) ||
    (order.display_id ? String(order.display_id) : null)
  if (shopNumber) metadata.shop_number = shopNumber
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
      shippingTotal: shopOrderShipping(order) ?? undefined,
      items,
    })
    const ids = extractOzonCreateIds(created)
    await saveMeta({
      ...metadata,
      ozon_order_number: ids.orderNumber,
      ozon_posting_number: ids.postingNumber,
      ozon_tracking: ids.trackingUrl,
      ozon_create_error: null,
      ozon_create_raw: JSON.stringify({
        ids,
        created: {
          order_number: ids.orderNumber,
          posting_number: ids.postingNumber,
        },
      }).slice(0, 2000),
    })
    await recordShopEvent(container, {
      kind: "ozon_create",
      title: "Отправление создано в Ozon",
      message: ids.postingNumber
        ? `Номер отправления ${ids.postingNumber}`
        : "Ozon принял заказ",
      detail: shopEventJsonDetail({
        ids,
        created,
        requests: created.ozon_requests,
      }),
      order_id: orderId,
      shop_number: metadata.shop_number
        ? String(metadata.shop_number)
        : order.display_id
          ? String(order.display_id)
          : null,
      posting_number: ids.postingNumber,
    })
  } catch (error) {
    const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
    const raw = error instanceof Error ? error.message : String(error)
    const message = ozonAdminErrorMessage(error)
    logger.warn(`Ozon order create failed for ${orderId}: ${raw}`)
    await recordShopEvent(container, {
      kind: "ozon_create",
      level: "error",
      title: "Не удалось создать отправление Ozon",
      message,
      detail: shopEventErrorDetail(error),
      order_id: orderId,
      shop_number: metadata.shop_number
        ? String(metadata.shop_number)
        : order.display_id
          ? String(order.display_id)
          : null,
    })
    try {
      await saveMeta({
        ...metadata,
        ozon_create_error: raw.slice(0, 1500),
      })
    } catch {
      // Metadata write is best-effort after a failed create.
    }
  }
}

export const config: SubscriberConfig = {
  event: "order.placed",
}
