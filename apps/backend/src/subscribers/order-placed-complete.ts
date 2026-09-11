import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { completeOrderWorkflow } from "@medusajs/medusa/core-flows"

export default async function orderPlacedComplete({
  event,
  container,
}: SubscriberArgs<{ id: string }>) {
  const orderId = event.data.id
  if (!orderId) return
  try {
    await completeOrderWorkflow(container).run({
      input: { orderIds: [orderId] },
    })
  } catch (error) {
    const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
    const message = error instanceof Error ? error.message : String(error)
    logger.warn(`Could not mark order ${orderId} completed: ${message}`)
  }
}

export const config: SubscriberConfig = {
  event: "order.placed",
}
