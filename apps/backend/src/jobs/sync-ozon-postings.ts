import { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { recordShopEvent } from "../lib/shop-event"
import { applyOzonStatusToFulfillment } from "../lib/shop-fulfillment"

export default async function syncOzonPostingsJob(container: MedusaContainer) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const pageSize = 100
  for (let page = 0; page < 5; page++) {
    const { data } = await query.graph({
      entity: "order",
      fields: ["id", "status", "metadata"],
      filters: { status: ["pending", "completed"] },
      pagination: { skip: page * pageSize, take: pageSize },
    })
    const rows = (data ?? []) as Array<Record<string, unknown>>
    if (!rows.length) break
    const orders = rows.filter((order) => {
      const metadata = (order.metadata || {}) as Record<string, unknown>
      return Boolean(metadata.ozon_posting_number || metadata.ozon_order_number)
    })
    for (const order of orders) {
      try {
        await applyOzonStatusToFulfillment(container, String(order.id))
      } catch (error) {
        const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
        const message = error instanceof Error ? error.message : String(error)
        logger.warn(`Ozon status sync failed for ${order.id}: ${message}`)
        const metadata = (order.metadata || {}) as Record<string, unknown>
        await recordShopEvent(container, {
          kind: "ozon_sync",
          level: "error",
          title: "Синхронизация Ozon не удалась",
          message: /Ozon HTTP|\bHTTP\s*\d+|[{"]/.test(message)
            ? "Не удалось обновить статус доставки Ozon."
            : message.slice(0, 280),
          order_id: String(order.id),
          shop_number: metadata.shop_number
            ? String(metadata.shop_number)
            : null,
          posting_number: metadata.ozon_posting_number
            ? String(metadata.ozon_posting_number)
            : null,
        })
      }
    }
    if (rows.length < pageSize) break
  }
}

export const config = {
  name: "sync-ozon-postings",
  schedule: "*/5 * * * *",
}
