import { MedusaContainer } from "@medusajs/framework"
import { MedusaError } from "@medusajs/framework/utils"
import { findShopOrderLookup } from "./shop-order-number"
import {
  cancelShopOrder,
  errorText,
  loadShopOrderRecord,
  parseShopOrderCancel,
  parseShopOrderRefund,
  refundShopOrder,
} from "./shop-order"
import { shopEventJsonDetail } from "./shop-event"
import { SHOP_EVENT_MODULE } from "../modules/shop-event"
import type ShopEventModuleService from "../modules/shop-event/service"
import { sendSmtpMail } from "./smtp"
import { shopOrderUrl } from "./custom-order"
import {
  customerOrderStatus,
  shopOrderCanMessage,
} from "./shop-order-view"
import {
  orderIsCanceled,
  orderLooksPaid,
  shopFulfillmentOf,
} from "./shop-fulfillment-status"

export const SHOP_ISSUE_KIND = "order_message"

export type ShopIssueStatus = "open" | "refunded" | "canceled" | "closed"

type ShopIssueReply = {
  at: string
  text: string
}

type ShopIssueDetail = {
  email: string
  body: string
  status: ShopIssueStatus
  medusa_order_id: string | null
  source: "order" | "custom" | null
  replies: ShopIssueReply[]
}

function asRecord(value: unknown) {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {}
}

export function parseShopIssueDetail(
  row: Record<string, unknown>
): ShopIssueDetail {
  const rec = asRecord(
    (() => {
      const raw = String(row.detail || "").trim()
      if (!raw.startsWith("{")) return null
      try {
        return JSON.parse(raw)
      } catch {
        return null
      }
    })()
  )
  const statusRaw = String(rec.status || "")
  const status: ShopIssueStatus =
    statusRaw === "refunded" ||
    statusRaw === "canceled" ||
    statusRaw === "closed"
      ? statusRaw
      : "open"
  const replies = Array.isArray(rec.replies)
    ? rec.replies
        .map((item) => {
          const reply = asRecord(item)
          const text = String(reply.text || "").trim()
          if (!text) return null
          return {
            at: String(reply.at || ""),
            text,
          }
        })
        .filter(Boolean) as ShopIssueReply[]
    : []
  const source =
    rec.source === "custom" || rec.source === "order"
      ? rec.source
      : null
  return {
    email: String(rec.email || "").trim().toLowerCase(),
    body: String(rec.body || row.message || "").trim(),
    status: String(row.level || "") === "info" ? "closed" : status,
    medusa_order_id: rec.medusa_order_id
      ? String(rec.medusa_order_id)
      : null,
    source,
    replies,
  }
}

export function shopIssueDetailPayload(detail: ShopIssueDetail) {
  return shopEventJsonDetail(detail)
}

export function parseShopIssueReply(body: unknown) {
  const rec = asRecord(body)
  const message = String(rec.message ?? rec.text ?? rec.note ?? "").trim()
  if (message.length < 2) {
    return { error: "Напишите ответ покупателю" }
  }
  return { message: message.slice(0, 4000) }
}

function issueService(container: MedusaContainer) {
  return container.resolve(SHOP_EVENT_MODULE) as ShopEventModuleService
}

async function loadIssueRow(container: MedusaContainer, id: string) {
  try {
    const row = (await issueService(container).retrieveShopEvent(id)) as unknown as Record<
      string,
      unknown
    >
    if (String(row.kind || "") !== SHOP_ISSUE_KIND) return null
    return row
  } catch {
    return null
  }
}

async function saveIssue(
  container: MedusaContainer,
  row: Record<string, unknown>,
  detail: ShopIssueDetail
) {
  await issueService(container).updateShopEvents({
    id: String(row.id),
    level: detail.status === "closed" ? "info" : "warn",
    detail: shopIssueDetailPayload(detail),
  })
}

async function resolveMedusaId(
  container: MedusaContainer,
  row: Record<string, unknown>,
  detail: ShopIssueDetail
) {
  if (detail.medusa_order_id) return detail.medusa_order_id
  const number = String(row.shop_number || row.order_id || "")
  const lookup = await findShopOrderLookup(container, number)
  if (lookup && String(lookup.source) === "order") {
    return String(lookup.ref_id || "")
  }
  return null
}

export async function presentShopIssue(
  container: MedusaContainer,
  row: Record<string, unknown>
) {
  const detail = parseShopIssueDetail(row)
  const shopNumber = String(row.shop_number || row.order_id || "")
  const lookup = await findShopOrderLookup(container, shopNumber)
  const source =
    detail.source ||
    (lookup && String(lookup.source) === "custom" ? "custom" : "order")
  const medusaId =
    (await resolveMedusaId(container, row, detail)) ||
    (source === "order" && lookup ? String(lookup.ref_id || "") : null)
  let order: Record<string, unknown> | null = null
  if (medusaId) {
    order = await loadShopOrderRecord(container, medusaId)
  }
  const metadata = asRecord(order?.metadata)
  const payments = Array.isArray(order?.payment_collections)
    ? (order.payment_collections as Array<Record<string, unknown>>)
    : []
  const refunded = payments.some((collection) =>
    ((collection.payments as Array<Record<string, unknown>>) || []).some(
      (payment) =>
        Array.isArray(payment.refunds) && payment.refunds.length > 0
    )
  )
  const status = order
    ? customerOrderStatus({
        source: "order",
        status: orderIsCanceled(order) ? "canceled" : String(order.status || ""),
        paid: orderLooksPaid(order),
        fulfillment: shopFulfillmentOf(order),
      })
    : null
  return {
    id: String(row.id || ""),
    created_at: row.created_at ? String(row.created_at) : null,
    shop_number: shopNumber || null,
    email: detail.email || (order?.email ? String(order.email) : null),
    message: detail.body,
    status: detail.status,
    replies: detail.replies,
    source,
    medusa_order_id: medusaId,
    can_refund: Boolean(medusaId && order && order.status !== "canceled"),
    can_cancel: Boolean(medusaId && order && order.status !== "canceled"),
    can_message: status ? shopOrderCanMessage(status.code) : false,
    refunded: refunded || Boolean(metadata.refund_without_cancel),
    order_status: status,
    buyer_url: shopNumber ? shopOrderUrl(shopNumber, process.env) : null,
    admin_url: medusaId ? `/orders/${medusaId}` : null,
  }
}

export async function listShopIssues(
  container: MedusaContainer,
  input: { status?: string; q?: string; limit: number; offset: number }
) {
  const service = issueService(container)
  const filters: Record<string, unknown> = { kind: SHOP_ISSUE_KIND }
  if (input.status !== "all") {
    filters.level = input.status === "closed" ? "info" : "warn"
  }
  const [rows, count] = await service.listAndCountShopEvents(filters, {
    order: { created_at: "DESC" },
    take: input.limit,
    skip: input.offset,
  })
  const q = String(input.q || "").trim().toLowerCase()
  const issues = []
  for (const row of rows as unknown as Array<Record<string, unknown>>) {
    const presented = await presentShopIssue(container, row)
    if (q) {
      const hay = [
        presented.shop_number,
        presented.email,
        presented.message,
        presented.medusa_order_id,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
      if (!hay.includes(q)) continue
    }
    issues.push(presented)
  }
  return { issues, count }
}

export async function getShopIssue(container: MedusaContainer, id: string) {
  const row = await loadIssueRow(container, id)
  if (!row) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, "Обращение не найдено")
  }
  return presentShopIssue(container, row)
}

async function withIssue(
  container: MedusaContainer,
  id: string,
  run: (
    row: Record<string, unknown>,
    detail: ShopIssueDetail
  ) => Promise<ShopIssueDetail>
) {
  const row = await loadIssueRow(container, id)
  if (!row) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, "Обращение не найдено")
  }
  const next = await run(row, parseShopIssueDetail(row))
  await saveIssue(container, row, next)
  return presentShopIssue(container, {
    ...row,
    level: next.status === "closed" ? "info" : "warn",
    detail: shopIssueDetailPayload(next),
  })
}

export async function refundShopIssue(
  container: MedusaContainer,
  id: string,
  body: unknown
) {
  const parsed = parseShopOrderRefund(body)
  return withIssue(container, id, async (row, detail) => {
    const orderId = await resolveMedusaId(container, row, detail)
    if (!orderId) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        "По этому обращению нет магазинного заказа для возврата"
      )
    }
    await refundShopOrder(container, orderId, parsed.note)
    return { ...detail, medusa_order_id: orderId, status: "refunded" }
  })
}

export async function cancelShopIssue(
  container: MedusaContainer,
  id: string,
  body: unknown
) {
  const parsed = parseShopOrderCancel(body)
  if ("error" in parsed) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, parsed.error)
  }
  return withIssue(container, id, async (row, detail) => {
    const orderId = await resolveMedusaId(container, row, detail)
    if (!orderId) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        "По этому обращению нет магазинного заказа для отмены"
      )
    }
    await cancelShopOrder(container, orderId, parsed)
    return { ...detail, medusa_order_id: orderId, status: "canceled" }
  })
}

export async function replyShopIssue(
  container: MedusaContainer,
  id: string,
  body: unknown
) {
  const parsed = parseShopIssueReply(body)
  if ("error" in parsed) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, parsed.error)
  }
  return withIssue(container, id, async (row, detail) => {
    const email = detail.email
    if (!email.includes("@")) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "В обращении нет почты покупателя"
      )
    }
    const number = String(row.shop_number || row.order_id || "")
    try {
      await sendSmtpMail({
        to: email,
        subject: number
          ? `Заказ ${number}: ответ по обращению`
          : "Ответ по обращению",
        text: parsed.message,
      })
    } catch (error) {
      throw new MedusaError(
        MedusaError.Types.UNEXPECTED_STATE,
        errorText(error, "Не удалось отправить письмо")
      )
    }
    return {
      ...detail,
      replies: [
        ...detail.replies,
        { at: new Date().toISOString(), text: parsed.message },
      ],
    }
  })
}

export async function closeShopIssue(container: MedusaContainer, id: string) {
  return withIssue(container, id, async (_row, detail) => ({
    ...detail,
    status: "closed",
  }))
}

export { errorText }
