import { MedusaContainer } from "@medusajs/framework"
import { ContainerRegistrationKeys, MedusaError, Modules } from "@medusajs/framework/utils"
import { refundPaymentWorkflow } from "@medusajs/medusa/core-flows"
import { cancelOzonForOrder } from "./ozon-fulfill"
import { isAlreadyClosedTbankError } from "./tbank-paid"

export function errorText(error: unknown, fallback = "cancel_failed"): string {
  if (!error) return fallback
  if (typeof error === "string" && error.trim()) return error.trim()
  if (error instanceof Error && error.message) return error.message
  if (typeof error === "object") {
    const rec = error as Record<string, unknown>
    if (typeof rec.message === "string" && rec.message.trim()) {
      return rec.message.trim()
    }
    if (rec.error && rec.error !== error) {
      const nested = errorText(rec.error, fallback)
      if (nested !== fallback) return nested
    }
    if (Array.isArray(rec.errors) && rec.errors[0]) {
      const nested = errorText(rec.errors[0], fallback)
      if (nested !== fallback) return nested
    }
  }
  return fallback
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

function paymentCaptured(payment: Record<string, unknown>) {
  const captures = (payment.captures as unknown[]) || []
  return captures.length > 0 || Boolean(payment.captured_at)
}

function paymentAlreadyRefunded(payment: Record<string, unknown>) {
  const refunds = (payment.refunds as unknown[]) || []
  return refunds.length > 0
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
      "payment_collections.payments.captured_at",
      "payment_collections.payments.captures.id",
      "payment_collections.payments.captures.amount",
      "payment_collections.payments.refunds.id",
      "payment_collections.payments.refunds.amount",
    ],
    filters: { id: orderId },
  })
  const order = ((data ?? [])[0] || null) as Record<string, unknown> | null
  if (!order) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, "order_not_found")
  }
  if (order.status === "canceled") {
    return { id: orderId, canceled: true, refunded: false }
  }
  await cancelOzonForOrder(container, orderId)

  let logger: { warn?: (message: string) => void } = {}
  try {
    logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  } catch {
    // Logging is optional during cancel.
  }
  const paymentModule = container.resolve(Modules.PAYMENT) as {
    cancelPayment?: (id: string) => Promise<unknown>
  }
  let refunded = false
  for (const payment of flattenPayments(order)) {
    const id = String(payment.id || "")
    if (!id) continue
    const captured = paymentCaptured(payment)
    if (refund && captured) {
      if (paymentAlreadyRefunded(payment)) {
        refunded = true
        continue
      }
      try {
        await refundPaymentWorkflow(container).run({
          input: { payment_id: id },
        })
        refunded = true
      } catch (error) {
        const message = errorText(error)
        if (isAlreadyClosedTbankError(error) || isAlreadyClosedTbankError(message)) {
          refunded = true
          continue
        }
        logger.warn?.(
          `Refund failed while canceling ${orderId} payment ${id}: ${message}`
        )
      }
    } else if (!captured && paymentModule.cancelPayment) {
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
