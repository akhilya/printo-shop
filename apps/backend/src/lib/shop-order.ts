import { MedusaContainer } from "@medusajs/framework"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { refundPaymentWorkflow } from "@medusajs/medusa/core-flows"

function money(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (value && typeof value === "object") {
    const rec = value as { numeric?: unknown; value?: unknown }
    if (typeof rec.numeric === "number") return rec.numeric
    const fromValue = Number(rec.value)
    if (Number.isFinite(fromValue)) return fromValue
  }
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : 0
}

function flattenPayments(order: Record<string, unknown>) {
  const collections = (order.payment_collections as Array<Record<string, unknown>>) || []
  const payments: Array<Record<string, unknown>> = []
  for (const collection of collections) {
    const rows = (collection.payments as Array<Record<string, unknown>>) || []
    payments.push(...rows)
  }
  return payments
}

export async function cancelShopOrder(
  container: MedusaContainer,
  orderId: string,
  refund: boolean
) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "order",
    fields: [
      "id",
      "status",
      "payment_collections.payments.id",
      "payment_collections.payments.amount",
      "payment_collections.payments.captures.id",
      "payment_collections.payments.captures.amount",
      "payment_collections.payments.refunds.amount",
    ],
    filters: { id: orderId },
  })
  const order = ((data ?? [])[0] || null) as Record<string, unknown> | null
  if (!order) {
    throw new Error("order_not_found")
  }
  if (order.status === "canceled") {
    return { id: orderId, canceled: true, refunded: false }
  }

  const paymentModule = container.resolve(Modules.PAYMENT) as {
    cancelPayment?: (id: string) => Promise<unknown>
  }
  let refunded = false
  for (const payment of flattenPayments(order)) {
    const id = String(payment.id || "")
    if (!id) continue
    const captures = (payment.captures as unknown[]) || []
    if (refund && captures.length) {
      await refundPaymentWorkflow(container).run({
        input: { payment_id: id },
      })
      refunded = true
    } else if (!captures.length && paymentModule.cancelPayment) {
      try {
        await paymentModule.cancelPayment(id)
      } catch {
        // Session may already be closed.
      }
    }
  }

  const orderModule = container.resolve(Modules.ORDER) as {
    cancel: (ids: string[] | string) => Promise<unknown>
  }
  await orderModule.cancel([orderId])
  return { id: orderId, canceled: true, refunded }
}
