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

export function isGiftCardPromotion(row: Record<string, unknown> | null | undefined) {
  const metadata = row?.metadata
  return Boolean(
    metadata &&
      typeof metadata === "object" &&
      (metadata as Record<string, unknown>).gift_card === true
  )
}

const PAGE_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"

export function promotionPageKey(code = "") {
  const blocked = String(code || "").trim().toLowerCase()
  for (let attempt = 0; attempt < 8; attempt++) {
    let key = ""
    for (let i = 0; i < 10; i++) {
      key += PAGE_ALPHABET[Math.floor(Math.random() * PAGE_ALPHABET.length)]
    }
    if (key !== blocked) return key
  }
  return `p${Date.now().toString(36)}`
}

export function promotionPageFromRow(row: Record<string, unknown> | null | undefined) {
  const meta = row?.metadata
  const page =
    meta && typeof meta === "object"
      ? String((meta as Record<string, unknown>).page || "").trim().toLowerCase()
      : ""
  const code = text(row?.code).toLowerCase()
  if (!/^[a-z0-9]{8,16}$/.test(page) || page === code) return ""
  return page
}

export type ShopPromotionCreate = {
  code: string
  type: "standard"
  status: "active"
  is_automatic: boolean
  limit: number | null
  metadata?: { page: string }
  application_method: {
    type: "percentage" | "fixed"
    value: number
    target_type: "items" | "order"
    currency_code: "rub"
    allocation: "across"
  }
}

export function parseShopPromotionMaxUses(value: unknown) {
  if (value == null || value === "") return 0
  const n = Number(value)
  if (!Number.isFinite(n) || n < 0 || Math.trunc(n) !== n) {
    return { error: "Укажите число применений" }
  }
  return Math.trunc(n)
}

export function shopPromotionMaxUses(row: Record<string, unknown>) {
  const n = Number(row.limit)
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : 0
}

export function promotionIsExhausted(used: number, max: number) {
  return max > 0 && used >= max
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
  const maxUses = parseShopPromotionMaxUses(
    rec.limit != null && rec.limit !== "" ? rec.limit : rec.max_uses
  )
  if (typeof maxUses !== "number") return maxUses
  return {
    code,
    type: "standard",
    status: "active",
    is_automatic: rec.is_automatic === true,
    limit: maxUses > 0 ? maxUses : null,
    application_method: {
      type,
      value: type === "percentage" ? value : Math.round(value),
      target_type: rec.include_shipping === true ? "order" : "items",
      currency_code: "rub",
      allocation: "across",
    },
    ...(rec.is_automatic === true
      ? {}
      : { metadata: { page: promotionPageKey(code) } }),
  }
}

export type ShopPromotionUpdate = {
  include_shipping?: boolean
  status?: "active" | "inactive"
  application_method?: { target_type: "items" | "order" }
}

export function parseShopPromotionUpdate(
  body: unknown
): ShopPromotionUpdate | { error: string } {
  const rec =
    body && typeof body === "object" ? (body as Record<string, unknown>) : {}
  const next: ShopPromotionUpdate = {}
  if (typeof rec.include_shipping === "boolean") {
    next.include_shipping = rec.include_shipping
    next.application_method = {
      target_type: rec.include_shipping ? "order" : "items",
    }
  }
  if (rec.status != null && rec.status !== "") {
    const status = String(rec.status).toLowerCase()
    if (status !== "active" && status !== "inactive") {
      return { error: "Укажите статус скидки" }
    }
    next.status = status as "active" | "inactive"
  }
  if (!next.application_method && !next.status) {
    return { error: "Укажите, учитывать ли доставку" }
  }
  return next
}

function pushCode(codes: Set<string>, value: unknown) {
  const code = text(value).toUpperCase()
  if (code) codes.add(code)
}

export function promotionCodesFromOrder(order: Record<string, unknown>) {
  const codes = new Set<string>()
  const promotions = Array.isArray(order.promotions) ? order.promotions : []
  for (const row of promotions) {
    if (row && typeof row === "object") {
      pushCode(codes, (row as Record<string, unknown>).code)
    }
  }
  const items = Array.isArray(order.items) ? order.items : []
  for (const item of items) {
    const rec = item && typeof item === "object" ? (item as Record<string, unknown>) : {}
    const adjustments = Array.isArray(rec.adjustments) ? rec.adjustments : []
    for (const adjustment of adjustments) {
      if (adjustment && typeof adjustment === "object") {
        pushCode(codes, (adjustment as Record<string, unknown>).code)
      }
    }
  }
  const shipping = Array.isArray(order.shipping_methods)
    ? order.shipping_methods
    : []
  for (const method of shipping) {
    const rec =
      method && typeof method === "object" ? (method as Record<string, unknown>) : {}
    const adjustments = Array.isArray(rec.adjustments) ? rec.adjustments : []
    for (const adjustment of adjustments) {
      if (adjustment && typeof adjustment === "object") {
        pushCode(codes, (adjustment as Record<string, unknown>).code)
      }
    }
  }
  return [...codes]
}

export function tallyPromotionUses(codeLists: string[][]) {
  const counts: Record<string, number> = {}
  for (const list of codeLists) {
    const unique = new Set(
      list.map((code) => String(code || "").trim().toUpperCase()).filter(Boolean)
    )
    for (const code of unique) {
      counts[code] = (counts[code] || 0) + 1
    }
  }
  return counts
}

export function promotionUsesLabel(used: number, max = 0) {
  const n = Math.max(0, Math.trunc(Number(used) || 0))
  const cap = Math.max(0, Math.trunc(Number(max) || 0))
  return `${n}/${cap}`
}

export function presentPublicPromo(
  row: Record<string, unknown> | null | undefined,
  used = 0
) {
  if (!row || row.is_automatic === true || isGiftCardPromotion(row)) return null
  if (String(row.status || "") !== "active") return null
  const code = text(row.code).toUpperCase()
  if (!/^[A-Z0-9_-]{3,32}$/.test(code)) return null
  const method = (row.application_method || {}) as Record<string, unknown>
  const type = String(method.type || "").toLowerCase().includes("fixed")
    ? "fixed"
    : "percentage"
  const value = Number(method.value)
  if (!Number.isFinite(value) || value <= 0) return null
  if (promotionIsExhausted(used, shopPromotionMaxUses(row))) {
    return { ended: true as const }
  }
  return {
    ended: false as const,
    code,
    type: type as "fixed" | "percentage",
    value: type === "percentage" ? value : Math.round(value),
    include_shipping: promotionIncludesShipping(method.target_type),
  }
}

export function presentShopPromotion(
  row: Record<string, unknown>,
  usageByCode: Record<string, number> = {}
) {
  const method = (row.application_method || {}) as Record<string, unknown>
  const type = method.type === "fixed" ? "fixed" : "percentage"
  const code = String(row.code || "")
  const metadata = row.metadata && typeof row.metadata === "object"
    ? (row.metadata as Record<string, unknown>)
    : {}
  return {
    id: String(row.id || ""),
    code,
    is_automatic: row.is_automatic === true,
    status: String(row.status || ""),
    type,
    value: Number(method.value) || 0,
    include_shipping: promotionIncludesShipping(method.target_type),
    application_method_id: String(method.id || ""),
    max_uses: shopPromotionMaxUses(row),
    used_count: usageByCode[code.toUpperCase()] || 0,
    page: promotionPageFromRow(row),
    gift_card: metadata.gift_card === true,
  }
}
