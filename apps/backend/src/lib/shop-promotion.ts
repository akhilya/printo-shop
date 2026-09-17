export function promotionIncludesShipping(targetType: unknown) {
  return String(targetType || "").toLowerCase() === "order"
}

export function promotionDiscountAmount(
  method: { type?: unknown; value?: unknown; target_type?: unknown },
  base: { items: number; shipping: number }
) {
  const value = Number(method.value)
  if (!Number.isFinite(value) || value <= 0) return 0
  const includeShipping = promotionIncludesShipping(method.target_type)
  const cap = Math.max(
    0,
    includeShipping ? base.items + base.shipping : base.items
  )
  let amount = 0
  if (String(method.type || "").toLowerCase().includes("percent")) {
    amount = Math.round((cap * value) / 100)
  } else {
    amount = Math.round(value)
  }
  return Math.min(Math.max(amount, 0), cap)
}

function text(value: unknown) {
  return String(value || "").trim()
}

export type ShopPromotionCreate = {
  code: string
  type: "standard"
  status: "active"
  is_automatic: boolean
  application_method: {
    type: "percentage" | "fixed"
    value: number
    target_type: "items" | "order"
    currency_code: "rub"
    allocation: "across"
  }
}

export function parseShopPromotionCreate(
  body: unknown
): ShopPromotionCreate | { error: string } {
  const rec =
    body && typeof body === "object" ? (body as Record<string, unknown>) : {}
  const code = text(rec.code).toUpperCase()
  if (!/^[A-Z0-9_-]{3,32}$/.test(code)) {
    return { error: "Код: латиница, цифры, 3–32 символа" }
  }
  const type =
    rec.type === "fixed"
      ? "fixed"
      : rec.type === "percentage"
        ? "percentage"
        : ""
  if (!type) return { error: "Укажите тип скидки" }
  const value = Number(rec.value)
  if (!Number.isFinite(value) || value <= 0) {
    return { error: "Укажите размер скидки" }
  }
  if (type === "percentage" && value > 100) {
    return { error: "Процент не больше 100" }
  }
  return {
    code,
    type: "standard",
    status: "active",
    is_automatic: rec.is_automatic === true,
    application_method: {
      type,
      value: type === "percentage" ? value : Math.round(value),
      target_type: rec.include_shipping === true ? "order" : "items",
      currency_code: "rub",
      allocation: "across",
    },
  }
}

export function parseShopPromotionUpdate(body: unknown):
  | { include_shipping: boolean; application_method: { target_type: "items" | "order" } }
  | { error: string } {
  const rec =
    body && typeof body === "object" ? (body as Record<string, unknown>) : {}
  if (typeof rec.include_shipping !== "boolean") {
    return { error: "Укажите, учитывать ли доставку" }
  }
  return {
    include_shipping: rec.include_shipping,
    application_method: {
      target_type: rec.include_shipping ? "order" : "items",
    },
  }
}

export function presentShopPromotion(row: Record<string, unknown>) {
  const method = (row.application_method || {}) as Record<string, unknown>
  const type = method.type === "fixed" ? "fixed" : "percentage"
  return {
    id: String(row.id || ""),
    code: String(row.code || ""),
    is_automatic: row.is_automatic === true,
    status: String(row.status || ""),
    type,
    value: Number(method.value) || 0,
    include_shipping: promotionIncludesShipping(method.target_type),
    application_method_id: String(method.id || ""),
  }
}
