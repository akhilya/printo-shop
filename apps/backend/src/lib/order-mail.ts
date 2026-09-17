import { MedusaContainer } from "@medusajs/framework"
import { Modules } from "@medusajs/framework/utils"
import { shopLogoUrl, shopOrderUrl, shopReturnsUrl } from "./custom-order"
import { ozonTrackingUrl } from "./ozon-delivery"
import { loadShopOrder } from "./ozon-fulfill"
import { buildOrderMail, type OrderMailPayload } from "./order-mail-html"
import {
  cancelMailDetails,
  mailAlreadySent,
  mailEventFromShopStatus,
  type OrderMailEvent,
  withMailSent,
} from "./order-mail-copy"
import { customerOrderStatus } from "./shop-order-view"
import { orderLogContext, recordShopEvent } from "./shop-event"
import { shopFulfillmentOf } from "./shop-fulfillment-status"
import { sendSmtpMail, type OutgoingMail } from "./smtp"
import { ensureMedusaShopNumber } from "./shop-order-number"

function money(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (value && typeof value === "object") {
    const rec = value as { numeric?: unknown }
    if (typeof rec.numeric === "number") return rec.numeric
  }
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

function text(value: unknown) {
  return String(value || "").trim()
}

export function orderMailPayloadFromMedusa(
  order: Record<string, unknown>,
  event: OrderMailEvent,
  number: string
): OrderMailPayload | null {
  const email = text(order.email).toLowerCase()
  if (!email || !email.includes("@")) return null
  const metadata = (order.metadata || {}) as Record<string, unknown>
  const address = (order.shipping_address || {}) as Record<string, unknown>
  const name = [address.first_name, address.last_name]
    .map((part) => text(part))
    .filter(Boolean)
    .join(" ")
  const fulfillment = shopFulfillmentOf(order)
  const status = customerOrderStatus({
    source: "order",
    status: String(order.status || ""),
    paid: true,
    fulfillment,
  })
  const ozonNumber = text(metadata.ozon_order_number) || null
  return {
    event,
    number,
    url: shopOrderUrl(number),
    email,
    name: name || null,
    phone: text(address.phone) || null,
    status_label: status.label,
    items: ((order.items as Array<Record<string, unknown>>) || []).map(
      (item) => {
        const variant = (item.variant || {}) as Record<string, unknown>
        const product = (variant.product || {}) as Record<string, unknown>
        return {
          title: String(product.title || item.title || "Товар"),
          quantity: Number(item.quantity || 1),
          sku: variant.sku ? String(variant.sku) : null,
          unit_price: money(item.unit_price),
        }
      }
    ),
    shipping:
      money(metadata.ozon_shipping_amount) ??
      money(order.shipping_total),
    total: money(order.total),
    currency_code: String(order.currency_code || "rub"),
    ozon_point_name:
      text(metadata.ozon_point_name) || text(address.address_2) || null,
    ozon_point_address:
      text(metadata.ozon_point_address) || text(address.address_1) || null,
    ozon_tracking:
      text(metadata.ozon_tracking) || ozonTrackingUrl(ozonNumber),
    ozon_posting_number: text(metadata.ozon_posting_number) || null,
    return_kind: text(metadata.ozon_return_kind) || null,
    details:
      event === "canceled"
        ? cancelMailDetails({
            reason_label: text(metadata.cancel_reason),
            note: text(metadata.cancel_note),
            refund: metadata.cancel_refund !== false,
          })
        : null,
    returns_url: shopReturnsUrl(),
    logo_url: shopLogoUrl(),
  }
}

export function orderMailPayloadFromCustom(
  order: Record<string, unknown>,
  event: OrderMailEvent,
  number: string
): OrderMailPayload | null {
  const email = text(order.email).toLowerCase()
  if (!email || !email.includes("@")) return null
  const status = customerOrderStatus({
    source: "custom",
    status: String(order.status || ""),
    paid: Boolean(order.paid_at),
  })
  const title =
    text(order.product_title) || text(order.quote_note) || "Индивидуальный заказ"
  return {
    event,
    number,
    url: shopOrderUrl(number),
    email,
    name: text(order.name) || null,
    phone: text(order.phone) || null,
    status_label: status.label,
    items: [
      {
        title,
        quantity: 1,
        sku: null,
        unit_price: money(order.quote_amount),
      },
    ],
    shipping: money(order.quote_shipping_amount),
    total: money(order.quote_amount),
    currency_code: "rub",
    ozon_point_name: text(order.ozon_point_name) || null,
    ozon_point_address: text(order.ozon_point_address) || null,
    ozon_tracking: text(order.ozon_tracking) || null,
    ozon_posting_number: text(order.ozon_posting_number) || null,
    details: text(order.quote_note || order.message) || null,
    returns_url: shopReturnsUrl(),
    logo_url: shopLogoUrl(),
  }
}

type SendMailFn = (mail: OutgoingMail) => Promise<{ skipped: boolean }>

async function dispatchMail(
  container: MedusaContainer,
  input: {
    order: Record<string, unknown>
    payload: OrderMailPayload
    event: OrderMailEvent
    save: (metadata: Record<string, unknown>) => Promise<void>
    send?: SendMailFn
  }
) {
  const metadata = (input.order.metadata || {}) as Record<string, unknown>
  if (mailAlreadySent(metadata, input.event)) return { skipped: true, reason: "sent" }
  const mail = buildOrderMail(input.payload)
  const send = input.send || sendSmtpMail
  try {
    const result = await send(mail)
    if (result.skipped) return { skipped: true, reason: "smtp" }
    await input.save(withMailSent(metadata, input.event))
    await recordShopEvent(container, {
      kind: "mail",
      title: "Письмо отправлено",
      message: `${mail.subject} → ${mail.to}`,
      ...orderLogContext(input.order),
      to_status: input.event,
    })
    return { skipped: false }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await recordShopEvent(container, {
      kind: "mail",
      level: "error",
      title: "Письмо не ушло",
      message,
      ...orderLogContext(input.order),
      to_status: input.event,
    })
    return { skipped: true, reason: "error" }
  }
}

export async function sendShopOrderMail(
  container: MedusaContainer,
  orderId: string,
  event: OrderMailEvent,
  send?: SendMailFn
) {
  const number = await ensureMedusaShopNumber(container, orderId)
  const order = await loadShopOrder(container, orderId, [
    "items.thumbnail",
    "shipping_total",
    "created_at",
    "currency_code",
  ])
  if (!order || !number) return { skipped: true, reason: "order" }
  const payload = orderMailPayloadFromMedusa(order, event, number)
  if (!payload) return { skipped: true, reason: "email" }
  return dispatchMail(container, {
    order,
    payload,
    event,
    send,
    save: async (metadata) => {
      const orderModule = container.resolve(Modules.ORDER) as {
        updateOrders: (
          id: string,
          data: { metadata: Record<string, unknown> }
        ) => Promise<unknown>
      }
      await orderModule.updateOrders(orderId, { metadata })
    },
  })
}

export async function sendCustomOrderMail(
  container: MedusaContainer,
  order: Record<string, unknown>,
  event: OrderMailEvent,
  send?: SendMailFn
) {
  const number = text(order.shop_number)
  const payload = orderMailPayloadFromCustom(order, event, number)
  if (!payload) return { skipped: true, reason: "email" }
  return dispatchMail(container, {
    order: {
      ...order,
      metadata: (order.metadata as Record<string, unknown>) || {},
    },
    payload,
    event,
    send,
    save: async () => {
      // Custom orders are mailed once from markCustomOrderPaid.
    },
  })
}

export { mailEventFromShopStatus }
