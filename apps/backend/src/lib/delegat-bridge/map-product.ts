import type {
  DelegatMappedProduct,
  DelegatMappedVariant,
  DelegatProductPayload,
  DelegatVariantPayload,
} from "./types"

export function slugify(value: string): string {
  const slug = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
  return slug || "product"
}

export function groupHandle(name: string, delegatGroupId?: string | null) {
  const slug = slugify(name)
  const base = slug && slug !== "product" ? slug : "group"
  if (delegatGroupId) return `${base}-${delegatGroupId}`.slice(0, 80)
  const hex = Buffer.from(name, "utf8").toString("hex").slice(0, 12)
  return `${base}-${hex || "untitled"}`.slice(0, 80)
}

function firstNonEmpty(...values: unknown[]): string | null {
  for (const value of values) {
    if (value == null) continue
    const text = String(value).trim()
    if (text) return text
  }
  return null
}

export function readGroupRef(payload: {
  group_id?: string | number | null
  groupId?: string | number | null
  group_name?: string | null
  groupName?: string | null
  raw_fields?: Record<string, unknown> | null
}): { groupId: string | null; groupName: string | null } {
  const raw = payload.raw_fields ?? {}
  return {
    groupId: firstNonEmpty(
      payload.group_id,
      payload.groupId,
      raw.group_id,
      raw.groupId,
      raw._localGroupId
    ),
    groupName: firstNonEmpty(
      payload.group_name,
      payload.groupName,
      raw.group_name,
      raw.groupName,
      raw._localGroupName
    ),
  }
}

export function toMedusaStatus(
  status?: string | null
): DelegatMappedProduct["status"] {
  const normalized = (status ?? "publish").trim().toLowerCase()
  if (normalized === "draft" || normalized === "proposed" || normalized === "rejected") {
    return normalized
  }
  return "published"
}

export function pickAmount(
  price?: number | null,
  salePrice?: number | null,
  oldPrice?: number | null
): number {
  if (oldPrice != null && price != null) return price
  if (salePrice != null && salePrice > 0 && (price == null || salePrice < price)) {
    return salePrice
  }
  return price ?? 0
}

export function pickOldPrice(
  price?: number | null,
  oldPrice?: number | null,
  salePrice?: number | null
): number | null {
  if (oldPrice != null && price != null && oldPrice > price) return oldPrice
  if (
    salePrice != null &&
    price != null &&
    price > salePrice &&
    oldPrice == null
  ) {
    return price
  }
  if (oldPrice != null && oldPrice > 0) return oldPrice
  return null
}

const RESERVED_FIELD_KEYS = new Set([
  "delegat_product_id",
  "product_id",
  "local_product_id",
  "sku",
  "name",
  "title",
  "handle",
  "description",
  "short_description",
  "price",
  "sale_price",
  "old_price",
  "oldPrice",
  "quantity",
  "barcode",
  "brand",
  "status",
  "category_ids",
  "category_id",
  "group_id",
  "groupId",
  "group_name",
  "groupName",
  "image_urls",
  "image_keys",
  "images",
  "attributes",
  "specs",
  "variants",
  "raw_fields",
  "id",
  "options",
  "thumbnail",
  "collection_id",
  "collection",
  "collections",
  "categories",
])

export function stringifySpecValue(value: unknown): string {
  if (value == null) return ""
  if (typeof value === "string") {
    const text = value.trim()
    const lower = text.toLowerCase()
    if (lower === "false") return "Нет"
    if (lower === "true") return "Да"
    return text
  }
  if (typeof value === "number" && Number.isFinite(value)) return String(value)
  if (typeof value === "boolean") return value ? "Да" : ""
  if (Array.isArray(value)) {
    return value.map(stringifySpecValue).filter(Boolean).join(", ")
  }
  if (typeof value === "object") {
    const rec = value as Record<string, unknown>
    if (rec.label != null || rec.value != null || rec.name != null) {
      return stringifySpecValue(rec.label ?? rec.value ?? rec.name)
    }
  }
  return ""
}

export function specLabelFromKey(key: string): string {
  const spaced = key.replace(/[_-]+/g, " ").trim()
  if (!spaced) return key
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

export function customFieldsFromPayload(
  payload: DelegatProductPayload
): Record<string, string> {
  const extra: Record<string, string> = {}
  const bags = [asRecord(payload), asRecord(payload.raw_fields)]
  for (const bag of bags) {
    for (const [key, value] of Object.entries(bag)) {
      if (RESERVED_FIELD_KEYS.has(key) || key.startsWith("_")) continue
      const text = stringifySpecValue(value)
      if (text) extra[key] = text
    }
  }
  return extra
}

export function mapProduct(payload: DelegatProductPayload): DelegatMappedProduct {
  const title = payload.name?.trim() || "Untitled"
  const variants = mapVariants(payload)
  const optionValues: Record<string, string[]> = {}
  for (const variant of variants) {
    for (const [key, value] of Object.entries(variant.options)) {
      const list = optionValues[key] ?? []
      if (!list.includes(value)) {
        list.push(value)
      }
      optionValues[key] = list
    }
  }

  const metadata: Record<string, string> = {}
  if (payload.delegat_product_id) {
    metadata.delegat_product_id = payload.delegat_product_id
  }
  if (payload.brand) {
    metadata.brand = payload.brand
  }
  if (payload.barcode) {
    metadata.barcode = payload.barcode
  }
  const active = pickAmount(payload.price, payload.sale_price, payload.old_price)
  const old = pickOldPrice(payload.price, payload.old_price, payload.sale_price)
  metadata.price = String(active)
  if (old != null) {
    metadata.old_price = String(old)
  }
  const extra = customFieldsFromPayload(payload)
  const attributes = { ...(payload.attributes ?? {}), ...extra }
  const specs = [...(payload.specs ?? [])]
  for (const [key, value] of Object.entries(extra)) {
    const exists = specs.some(
      (item) =>
        String(item.key || "") === key || String(item.label || "") === key
    )
    if (!exists) {
      specs.push({ key, label: specLabelFromKey(key), value })
    }
  }
  if (Object.keys(attributes).length) {
    metadata.attributes = JSON.stringify(attributes)
  }
  if (specs.length) {
    metadata.specs = JSON.stringify(specs)
  }
  if (payload.image_keys?.length) {
    metadata.image_keys = JSON.stringify(payload.image_keys)
  }
  const group = readGroupRef(payload)
  if (group.groupId) {
    metadata.delegat_group_id = group.groupId
  }
  if (group.groupName) {
    metadata.delegat_group_name = group.groupName
  }

  return {
    title,
    handle: slugify(payload.sku || title),
    description: payload.description ?? payload.short_description ?? undefined,
    status: toMedusaStatus(payload.status),
    sku: payload.sku ?? undefined,
    categoryIds: (payload.category_ids ?? []).filter(Boolean),
    imageUrls: (payload.image_urls ?? []).filter(Boolean),
    metadata,
    optionValues,
    variants,
  }
}

function mapVariants(payload: DelegatProductPayload): DelegatMappedVariant[] {
  const incoming = payload.variants?.filter((v) => v.variant_id) ?? []
  if (incoming.length === 0) {
    return [
      {
        delegatVariantId: payload.delegat_product_id || payload.sku || "default",
        title: "Default",
        sku: payload.sku ?? undefined,
        barcode: payload.barcode ?? undefined,
        options: { Title: "Default" },
        amount: pickAmount(payload.price, payload.sale_price, payload.old_price),
        old_price: pickOldPrice(payload.price, payload.old_price, payload.sale_price),
        quantity: payload.quantity ?? 0,
      },
    ]
  }

  return incoming.map((variant) => mapOneVariant(payload, variant))
}

function mapOneVariant(
  payload: DelegatProductPayload,
  variant: DelegatVariantPayload
): DelegatMappedVariant {
  const options = { ...(variant.attributes ?? {}) }
  if (!options.Size) {
    const size = variant.marketplace_size || variant.tech_size
    if (size) {
      options.Size = size
    }
  }
  if (Object.keys(options).length === 0) {
    options.Title = variant.tech_size || variant.sku || "Default"
  }

  const title =
    variant.tech_size ||
    variant.marketplace_size ||
    Object.values(options).join(" / ") ||
    "Default"

  return {
    delegatVariantId: variant.variant_id,
    title,
    sku: variant.sku || payload.sku || undefined,
    barcode: variant.barcode || undefined,
    options,
    amount: pickAmount(
      variant.price ?? payload.price,
      variant.sale_price ?? payload.sale_price,
      variant.old_price ?? payload.old_price
    ),
    old_price: pickOldPrice(
      variant.price ?? payload.price,
      variant.old_price ?? payload.old_price,
      variant.sale_price ?? payload.sale_price
    ),
    quantity: variant.quantity ?? payload.quantity ?? 0,
  }
}
