import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { packOzonForOrder } from "../lib/ozon-fulfill"

export default async function orderFulfillmentOzon({
  event,
  container,
}: SubscriberArgs<{ order_id?: string; fulfillment_id?: string }>) {
  const orderId = event.data.order_id
  if (!orderId) return
  try {
    await packOzonForOrder(container, orderId)
  } catch (error) {
    const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
    const message = error instanceof Error ? error.message : String(error)
    logger.warn(`Ozon pack after fulfillment failed for ${orderId}: ${message}`)
  }
}

export const config: SubscriberConfig = {
  event: "order.fulfillment_created",
}
