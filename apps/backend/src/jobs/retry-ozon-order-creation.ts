import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { isOzonCreateRetryDue } from "../lib/ozon-create-retry"
import { SHOP_EVENT_MODULE } from "../modules/shop-event"
import { createOzonOrderForMedusaOrder } from "../subscribers/order-placed-ozon"

export default async function retryOzonOrderCreationJob(
  container: MedusaContainer
) {
  const events = container.resolve(SHOP_EVENT_MODULE) as {
    listAndCountShopEvents: (
      filters: Record<string, unknown>,
      options: {
        order: { created_at: "DESC" }
        take: number
        skip: number
      }
    ) => Promise<[Array<{ order_id?: string | null }>, number]>
  }
  const [rows] = await events.listAndCountShopEvents(
    { kind: "ozon_create", level: "error" },
    { order: { created_at: "DESC" }, take: 1000, skip: 0 }
  )
  const orderIds = [
    ...new Set(
      rows
        .map((row) => row.order_id)
        .filter((id): id is string => typeof id === "string" && Boolean(id))
    ),
  ]
  if (!orderIds.length) return

  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "order",
    fields: ["id", "status", "metadata"],
    filters: { id: orderIds },
  })
  const dueOrderIds = ((data ?? []) as Array<Record<string, unknown>>)
    .filter((order) => {
      if (order.status === "canceled") return false
      return isOzonCreateRetryDue(
        (order.metadata || {}) as Record<string, unknown>
      )
    })
    .map((order) => String(order.id))
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)

  for (const orderId of dueOrderIds) {
    try {
      await createOzonOrderForMedusaOrder(container, orderId)
    } catch (error) {
      logger.warn(
        `Ozon order creation retry failed for ${orderId}: ${
          error instanceof Error ? error.message : String(error)
        }`
      )
    }
  }
}

export const config = {
  name: "retry-ozon-order-creation",
  schedule: "*/5 * * * *",
}
