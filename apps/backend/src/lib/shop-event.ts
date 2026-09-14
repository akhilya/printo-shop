import { MedusaContainer } from "@medusajs/framework"
import { SHOP_EVENT_MODULE } from "../modules/shop-event"
import type ShopEventModuleService from "../modules/shop-event/service"

export type ShopEventInput = {
  kind: string
  level?: "info" | "warn" | "error"
  title: string
  message: string
  order_id?: string | null
  shop_number?: string | null
  posting_number?: string | null
  from_status?: string | null
  to_status?: string | null
}

export function presentShopEvent(row: Record<string, unknown>) {
  return {
    id: String(row.id || ""),
    kind: String(row.kind || ""),
    level: String(row.level || "info"),
    title: String(row.title || ""),
    message: String(row.message || ""),
    order_id: row.order_id ? String(row.order_id) : null,
    shop_number: row.shop_number ? String(row.shop_number) : null,
    posting_number: row.posting_number ? String(row.posting_number) : null,
    from_status: row.from_status ? String(row.from_status) : null,
    to_status: row.to_status ? String(row.to_status) : null,
    created_at: row.created_at ? String(row.created_at) : null,
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
      message: input.message.slice(0, 2000),
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
