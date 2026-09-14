import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { sendShopOrderMail } from "../lib/order-mail"

export default async function orderPlacedMail({
  event,
  container,
}: SubscriberArgs<{ id: string }>) {
  const orderId = event.data.id
  if (!orderId) return
  try {
    await sendShopOrderMail(container, orderId, "placed")
  } catch (error) {
    const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
    const message = error instanceof Error ? error.message : String(error)
    logger.warn(`Order mail failed for ${orderId}: ${message}`)
  }
}

export const config: SubscriberConfig = {
  event: "order.placed",
}
