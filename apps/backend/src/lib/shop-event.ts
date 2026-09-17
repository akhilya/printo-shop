import { MedusaContainer } from "@medusajs/framework"
import { SHOP_EVENT_MODULE } from "../modules/shop-event"
import type ShopEventModuleService from "../modules/shop-event/service"

export type ShopEventInput = {
  kind: string
  level?: "info" | "warn" | "error"
  title: string
  message: string
  detail?: string | null
  order_id?: string | null
  shop_number?: string | null
  posting_number?: string | null
  from_status?: string | null
  to_status?: string | null
}

export function shopEventErrorDetail(error: unknown) {
  if (error instanceof Error) {
    return [error.name, error.message, error.stack].filter(Boolean).join("\n")
  }
  if (typeof error === "string") return error
  try {
    return JSON.stringify(error, null, 2)
  } catch {
    return String(error || "")
  }
}

export function prettyShopEventText(value: unknown) {
  const text = String(value ?? "").trim()
  if (!text) return ""
  const start = text.indexOf("{")
  if (start < 0) {
    const arrayStart = text.indexOf("[")
    if (arrayStart < 0) return text
    try {
      const parsed = JSON.parse(arrayStart === 0 ? text : text.slice(arrayStart))
      const pretty = JSON.stringify(parsed, null, 2)
      return arrayStart === 0
        ? pretty
        : `${text.slice(0, arrayStart).trim()}\n${pretty}`
    } catch {
      return text
    }
  }
  try {
    const parsed = JSON.parse(start === 0 ? text : text.slice(start))
    const pretty = JSON.stringify(parsed, null, 2)
    return start === 0 ? pretty : `${text.slice(0, start).trim()}\n${pretty}`
  } catch {
    return text
  }
}

export function shopEventJsonDetail(value: unknown) {
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value ?? "")
  }
}

export function presentShopEvent(row: Record<string, unknown>) {
  const message = String(row.message || "")
  const detail = row.detail ? String(row.detail) : ""
  return {
    id: String(row.id || ""),
    kind: String(row.kind || ""),
    level: String(row.level || "info"),
    title: String(row.title || ""),
    message,
    detail: detail || null,
    order_id: row.order_id ? String(row.order_id) : null,
    shop_number: row.shop_number ? String(row.shop_number) : null,
    posting_number: row.posting_number ? String(row.posting_number) : null,
    from_status: row.from_status ? String(row.from_status) : null,
    to_status: row.to_status ? String(row.to_status) : null,
    created_at: row.created_at ? String(row.created_at) : null,
    updated_at: row.updated_at ? String(row.updated_at) : null,
    dump: [prettyShopEventText(message), prettyShopEventText(detail)]
      .filter(Boolean)
      .join("\n\n"),
  }
}

export function shopEventSearchFilters(q: string) {
  const value = q.trim()
  if (!value) return {}
  const like = { $ilike: `%${value}%` }
  return {
    $or: [
      { title: like },
      { message: like },
      { detail: like },
      { order_id: like },
      { shop_number: like },
      { posting_number: like },
      { kind: like },
    ],
  }
}

export async function recordShopEvent(
  container: MedusaContainer,
  input: ShopEventInput
) {
  try {
    const service: ShopEventModuleService = container.resolve(SHOP_EVENT_MODULE)
    await service.createShopEvents({
      kind: input.kind.slice(0, 64),
      level: (input.level || "info").slice(0, 16),
      title: input.title.slice(0, 200),
      message: input.message.slice(0, 8000),
      detail: input.detail ? String(input.detail).slice(0, 32000) : null,
      order_id: input.order_id ? String(input.order_id).slice(0, 64) : null,
      shop_number: input.shop_number
        ? String(input.shop_number).slice(0, 32)
        : null,
      posting_number: input.posting_number
        ? String(input.posting_number).slice(0, 64)
        : null,
      from_status: input.from_status
        ? String(input.from_status).slice(0, 64)
        : null,
      to_status: input.to_status ? String(input.to_status).slice(0, 64) : null,
    })
  } catch {
    // Logging must not break packing or status sync.
  }
}

export function orderLogContext(order: Record<string, unknown>) {
  const metadata = (order.metadata || {}) as Record<string, unknown>
  return {
    order_id: order.id ? String(order.id) : null,
    shop_number: metadata.shop_number ? String(metadata.shop_number) : null,
    posting_number: metadata.ozon_posting_number
      ? String(metadata.ozon_posting_number)
      : metadata.ozon_order_number
        ? String(metadata.ozon_order_number)
        : null,
  }
}
