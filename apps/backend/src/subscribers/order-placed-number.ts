import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ensureMedusaShopNumber } from "../lib/shop-order-number"

export default async function orderPlacedNumber({
  event,
  container,
}: SubscriberArgs<{ id: string }>) {
  const orderId = event.data.id
  if (!orderId) return
  await ensureMedusaShopNumber(container, orderId)
}

export const config: SubscriberConfig = {
  event: "order.placed",
}
