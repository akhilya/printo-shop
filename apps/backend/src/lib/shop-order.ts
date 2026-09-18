import { MedusaContainer } from "@medusajs/framework"
import { ContainerRegistrationKeys, MedusaError, Modules } from "@medusajs/framework/utils"
import {
  cancelOrderFulfillmentWorkflow,
  refundPaymentWorkflow,
} from "@medusajs/medusa/core-flows"
import { cancelOzonForOrder } from "./ozon-fulfill"
import { sendShopOrderMail } from "./order-mail"
import { isAlreadyClosedTbankError } from "./tbank-paid"

export const SHOP_CANCEL_REASONS = {
  out_of_stock: "Товара нет в наличии",
  cannot_deliver: "Не получилось оформить доставку",
  order_error: "В заказе ошибка",
  customer_request: "Отменили по вашей просьбе",
  other: "Другая причина",
} as const

export type ShopCancelReason = keyof typeof SHOP_CANCEL_REASONS

export type ShopOrderCancelInput = {
  refund: boolean
  reason: ShopCancelReason | "unspecified"
  reason_label: string
  note: string
}

export function parseShopOrderCancel(
  body: unknown
): ShopOrderCancelInput | { error: string } {
  const rec =
    body && typeof body === "object" ? (body as Record<string, unknown>) : {}
  const refund = rec.refund !== false
  const note = String(rec.note ?? rec.message ?? rec.text ?? "")
    .trim()
    .slice(0, 500)
  const raw = String(rec.reason || "").trim()
  if (raw && raw in SHOP_CANCEL_REASONS) {
    const reason = raw as ShopCancelReason
    if (reason === "other" && !note) {
      return { error: "Напишите причину отмены" }
    }
    return {
      refund,
      reason,
      reason_label: SHOP_CANCEL_REASONS[reason],
      note,
    }
  }
  return {
    refund,
    reason: "unspecified",
    reason_label: "Заказ отменён",
    note,
  }
}

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

async function cancelNativeFulfillments(
  container: MedusaContainer,
  orderId: string,
  order: Record<string, unknown>
) {
  const rows = ((order.fulfillments as Array<Record<string, unknown>>) || []).filter(
    (row) => row.id && !row.canceled_at && !row.cancelled_at
  )
  for (const row of rows) {
    if (row.shipped_at || row.delivered_at) continue
    try {
      await cancelOrderFulfillmentWorkflow(container).run({
        input: {
          order_id: orderId,
          fulfillment_id: String(row.id),
          no_notification: true,
        },
      })
    } catch {
      // Already cancelled or Medusa will reject a shipped row.
    }
  }
}

export async function cancelShopOrder(
  container: MedusaContainer,
  orderId: string,
  input: boolean | ShopOrderCancelInput = true
) {
  const parsed =
    typeof input === "boolean"
      ? parseShopOrderCancel({ refund: input })
      : input
  if ("error" in parsed) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, parsed.error)
  }
  const order = await loadShopOrderRecord(container, orderId)
  if (!order) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, "order_not_found")
  }
  if (order.status === "canceled") {
    await cancelOzonForOrder(container, orderId)
    await cancelNativeFulfillments(container, orderId, order)
    return { id: orderId, canceled: true, refunded: false }
  }
  const metadata = (order.metadata || {}) as Record<string, unknown>
  const orderModule = container.resolve(Modules.ORDER) as {
    updateOrders: (
      id: string,
      data: { metadata: Record<string, unknown> }
    ) => Promise<unknown>
    cancel: (ids: string[] | string) => Promise<unknown>
  }
  await orderModule.updateOrders(orderId, {
    metadata: {
      ...metadata,
      cancel_reason: parsed.reason_label,
      cancel_note: parsed.note || null,
      cancel_refund: parsed.refund,
    },
  })
  await cancelOzonForOrder(container, orderId)
  await cancelNativeFulfillments(container, orderId, order)

  let logger: { warn?: (message: string) => void } = {}
  try {
    logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  } catch {
    // Logging is optional during cancel.
  }
  const refunded = await settleShopPayments(container, order, {
    refundCaptured: parsed.refund,
    cancelUncaptured: true,
    logPrefix: `cancel ${orderId}`,
  })

  await orderModule.cancel([orderId])
  try {
    await sendShopOrderMail(container, orderId, "canceled")
  } catch (error) {
    logger.warn?.(
      `Cancel mail failed for ${orderId}: ${errorText(error)}`
    )
  }
  return { id: orderId, canceled: true, refunded }
}

const ORDER_PAYMENT_FIELDS = [
  "id",
  "status",
  "email",
  "metadata",
  "payment_collections.payments.id",
  "payment_collections.payments.amount",
  "payment_collections.payments.captured_at",
  "payment_collections.payments.captures.id",
  "payment_collections.payments.captures.amount",
  "payment_collections.payments.refunds.id",
  "payment_collections.payments.refunds.amount",
  "fulfillments.id",
  "fulfillments.canceled_at",
  "fulfillments.shipped_at",
  "fulfillments.delivered_at",
]

export async function loadShopOrderRecord(
  container: MedusaContainer,
  orderId: string
) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "order",
    fields: ORDER_PAYMENT_FIELDS,
    filters: { id: orderId },
  })
  return (((data ?? [])[0] || null) as Record<string, unknown> | null)
}

async function settleShopPayments(
  container: MedusaContainer,
  order: Record<string, unknown>,
  input: {
    refundCaptured: boolean
    cancelUncaptured: boolean
    logPrefix: string
    throwOnRefundError?: boolean
  }
) {
  let logger: { warn?: (message: string) => void } = {}
  try {
    logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  } catch {
    // Logging is optional.
  }
  const paymentModule = container.resolve(Modules.PAYMENT) as {
    cancelPayment?: (id: string) => Promise<unknown>
  }
  let refunded = false
  for (const payment of flattenPayments(order)) {
    const id = String(payment.id || "")
    if (!id) continue
    const captured = paymentCaptured(payment)
    if (input.refundCaptured && captured) {
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
        logger.warn?.(`Refund failed while ${input.logPrefix} payment ${id}: ${message}`)
        if (input.throwOnRefundError) {
          throw new MedusaError(MedusaError.Types.UNEXPECTED_STATE, message)
        }
      }
    } else if (input.cancelUncaptured && !captured && paymentModule.cancelPayment) {
      try {
        await paymentModule.cancelPayment(id)
      } catch {
        // Session may already be closed.
      }
    }
  }
  return refunded
}

export function parseShopOrderRefund(body: unknown) {
  const rec =
    body && typeof body === "object" ? (body as Record<string, unknown>) : {}
  return {
    note: String(rec.note ?? rec.message ?? rec.text ?? "")
      .trim()
      .slice(0, 500),
  }
}

export async function refundShopOrder(
  container: MedusaContainer,
  orderId: string,
  note = ""
) {
  const order = await loadShopOrderRecord(container, orderId)
  if (!order) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, "order_not_found")
  }
  if (order.status === "canceled") {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "Заказ уже отменён. Возврат без отмены недоступен."
    )
  }
  const metadata = (order.metadata || {}) as Record<string, unknown>
  const orderModule = container.resolve(Modules.ORDER) as {
    updateOrders: (
      id: string,
      data: { metadata: Record<string, unknown> }
    ) => Promise<unknown>
  }
  const refunded = await settleShopPayments(container, order, {
    refundCaptured: true,
    cancelUncaptured: false,
    logPrefix: `refund ${orderId}`,
    throwOnRefundError: true,
  })
  await orderModule.updateOrders(orderId, {
    metadata: {
      ...metadata,
      refund_without_cancel: true,
      refund_note: note || null,
      refunded_at: new Date().toISOString(),
    },
  })
  const number = String(metadata.shop_number || "").trim()
  const email = String(order.email || "").trim()
  if (email) {
    try {
      const { sendSmtpMail } = await import("./smtp.js")
      await sendSmtpMail({
        to: email,
        subject: number ? `Заказ ${number}: вернули оплату` : "Вернули оплату",
        text: [
          number ? `Вернули оплату по заказу ${number}.` : "Вернули оплату.",
          "Сам заказ не отменяли.",
          note ? `Комментарий: ${note}` : "",
        ]
          .filter(Boolean)
          .join("\n"),
      })
    } catch {
      // Mail is best-effort after a successful refund.
    }
  }
  return { id: orderId, refunded, canceled: false }
}
