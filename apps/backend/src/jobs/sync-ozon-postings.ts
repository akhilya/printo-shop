import { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { ozonAdminErrorMessage } from "../lib/ozon-delivery"
import { ozonCreds } from "../lib/ozon-fulfill"
import { alignOzonReturnPoints } from "../lib/ozon-return-point"
import { recordShopEvent, shopEventErrorDetail } from "../lib/shop-event"
import { applyOzonStatusToFulfillment } from "../lib/shop-fulfillment"

async function alignReturnPoint(container: MedusaContainer) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  try {
    const creds = await ozonCreds(container)
    if (!creds) return
    const { updated } = await alignOzonReturnPoints(creds)
    if (updated) {
      logger.info(`Ozon return point set to the drop-off on ${updated} warehouse(s)`)
    }
  } catch (error) {
    logger.warn(`Ozon return point sync failed: ${shopEventErrorDetail(error)}`)
  }
}

export default async function syncOzonPostingsJob(container: MedusaContainer) {
  await alignReturnPoint(container)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const pageSize = 100
  for (let page = 0; page < 10; page++) {
    const { data } = await query.graph({
      entity: "order",
      fields: ["id", "status", "metadata"],
      filters: { status: ["pending", "completed", "archived"] },
      pagination: {
        skip: page * pageSize,
        take: pageSize,
        order: { created_at: "DESC" },
      },
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
        const message = ozonAdminErrorMessage(error)
        logger.warn(
          `Ozon status sync failed for ${order.id}: ${shopEventErrorDetail(error)}`
        )
        const metadata = (order.metadata || {}) as Record<string, unknown>
        await recordShopEvent(container, {
          kind: "ozon_sync",
          level: "error",
          title: "Синхронизация Ozon не удалась",
          message,
          detail: shopEventErrorDetail(error),
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
