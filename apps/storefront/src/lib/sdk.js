import Medusa from "@medusajs/js-sdk"

export const BACKEND_URL =
  import.meta.env.VITE_MEDUSA_BACKEND_URL || "http://localhost:9000"

export let REGION_ID = ""
let publishableKey = ""

export let sdk = new Medusa({
  baseUrl: BACKEND_URL,
  publishableKey: "",
  debug: import.meta.env.DEV,
})

export function storeHeaders() {
  return { "x-publishable-api-key": publishableKey }
}

export async function loadShopConfig() {
  const res = await fetch(`${BACKEND_URL}/hooks/storefront-config`)
  if (!res.ok) {
    throw new Error("Не удалось получить настройки витрины")
  }
  const data = await res.json()
  REGION_ID = data.region_id || ""
  publishableKey = data.publishable_key || ""
  sdk = new Medusa({
    baseUrl: BACKEND_URL,
    publishableKey,
    debug: import.meta.env.DEV,
  })
}

export const PAGE_SIZE = 12
export const HOME_GROUPS = 8
export const HOME_PRODUCTS = 8

export function visiblePages(current, total) {
  if (total <= 1) return []
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1)
  }
  const set = new Set([1, total, current - 1, current, current + 1])
  if (current <= 3) {
    set.add(2)
    set.add(3)
    set.add(4)
  }
  if (current >= total - 2) {
    set.add(total - 3)
    set.add(total - 2)
    set.add(total - 1)
  }
  const nums = [...set].filter((n) => n >= 1 && n <= total).sort((a, b) => a - b)
  const items = []
  for (const n of nums) {
    const prev = items[items.length - 1]
    if (typeof prev === "number" && n - prev > 1) items.push("…")
    items.push(n)
  }
  return items
}

export const productFields =
  "id,title,handle,thumbnail,description,collection_id,*variants.calculated_price,+variants.inventory_quantity,+variants.sku,*images,*collection,categories.id,categories.name,categories.handle,+metadata"

const SPEC_DENY =
  /тн\s*вэд|ндс|маркиров|\b18\s*\+|pdf|видео|название цвета|название файла|manufacturer|brand\s*\/|width \(mm\)|height \(mm\)|depth \(mm\)|length \(cm\)|заводск|уеи|оптом|delegat|barcode|regular_price|sale_price|озон|назначение подарка|повод/i

const SPEC_LABELS = {
  материал: "Материал",
  "высота предмета": "Высота",
  "ширина предмета": "Ширина",
  "количество фигурок": "Фигурок",
  "количество предметов в упаковке": "В упаковке",
  "цвет товара": "Цвет",
  цвет: "Цвет",
  бренд: "Бренд",
  "страна-изготовитель": "Страна",
  "страна производства": "Страна",
  "возрастные ограничения": "Возраст",
  "вес с упаковкой, г": "Вес",
  "weight (g)": "Вес",
  "вид упаковки": "Упаковка",
  коллекционные: "Коллекционные",
  "размер упаковки (длина х ширина х высота), см": "Упаковка, см",
}

const SPEC_ORDER = [
  "Материал",
  "Высота",
  "Ширина",
  "Фигурок",
  "В упаковке",
  "Цвет",
  "Бренд",
  "Страна",
  "Возраст",
  "Вес",
  "Упаковка",
  "Упаковка, см",
  "Коллекционные",
]

function parseAttributes(raw) {
  if (!raw) return {}
  if (typeof raw === "object") return raw
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === "object" ? parsed : {}
  } catch {
    return {}
  }
}

function formatSpecValue(value) {
  if (value == null) return ""
  if (typeof value === "object") {
    if (Array.isArray(value)) {
      return value.map(formatSpecValue).filter(Boolean).join(", ")
    }
    if (value.label != null || value.value != null || value.name != null) {
      return formatSpecValue(value.label ?? value.value ?? value.name)
    }
    return ""
  }
  const text = String(value).trim()
  if (!text) return ""
  const lower = text.toLowerCase()
  if (lower === "false" || lower === "нет бренда") return ""
  if (lower === "true" || lower === "да") return "Да"
  if (text.length > 240) return ""
  return text
}

function humanizeSpecKey(key) {
  const spaced = String(key || "").replace(/[_-]+/g, " ").trim()
  if (!spaced) return key
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

function parseShopSpecs(raw) {
  const parsed = parseAttributes(raw)
  if (Array.isArray(raw)) return raw
  if (Array.isArray(parsed)) return parsed
  return null
}

function withSku(rows, product) {
  const sku = product?.variants?.[0]?.sku
  if (!sku) return rows
  if (rows.some((row) => row.label === "Артикул" || row.key === "sku")) return rows
  return [...rows, { key: "sku", label: "Артикул", value: String(sku) }]
}

/**
 * Shopper-facing specs: PIM `metadata.specs`, then leftover attributes
 * (including custom mapped fields like test_field). Empty specs must not
 * hide the attribute dump.
 */
export function productSpecs(product) {
  const explicit = parseShopSpecs(product?.metadata?.specs)
  const attrs = parseAttributes(product?.metadata?.attributes)
  const title = (product?.title || "").trim().toLowerCase()
  const seen = new Set()
  const fromSpecs = []

  if (Array.isArray(explicit)) {
    for (const item of explicit) {
      const label = String(item?.label || "").trim()
      const value = String(item?.value ?? "").trim()
      if (!label || !value) continue
      const key = String(item?.key || label)
      seen.add(label.toLowerCase())
      seen.add(key.toLowerCase())
      fromSpecs.push({ key, label, value })
    }
  }

  const fromAttrs = new Map()
  const brand = String(product?.metadata?.brand || "").trim()
  if (brand && brand.toLowerCase() !== "нет бренда") {
    fromAttrs.set("Бренд", { key: "brand", label: "Бренд", value: brand })
    seen.add("бренд")
    seen.add("brand")
  }

  for (const [rawKey, rawValue] of Object.entries(attrs)) {
    const key = String(rawKey || "").trim()
    if (!key || SPEC_DENY.test(key)) continue
    let value = formatSpecValue(rawValue)
    if (!value) continue
    if (title && value.toLowerCase() === title) continue
    const label = SPEC_LABELS[key.toLowerCase()] || humanizeSpecKey(key)
    if (seen.has(label.toLowerCase()) || seen.has(key.toLowerCase())) continue
    if (/^\d+([.,]\d+)?$/.test(value)) {
      if (label === "Вес") value = `${value} г`
      else if (label === "Высота" || label === "Ширина") value = `${value} см`
    }
    seen.add(label.toLowerCase())
    seen.add(key.toLowerCase())
    fromAttrs.set(label, { key, label, value })
  }

  const ordered = [...fromSpecs]
  for (const label of SPEC_ORDER) {
    const row = fromAttrs.get(label)
    if (row) {
      ordered.push(row)
      fromAttrs.delete(label)
    }
  }
  for (const row of fromAttrs.values()) {
    ordered.push(row)
  }
  return withSku(ordered, product)
}

export function realVariants(product) {
  const variants = product?.variants || []
  if (variants.length <= 1) return []
  return variants
}

export function shopError(error, fallback) {
  const raw = String(
    error?.message || (typeof error === "string" ? error : "")
  ).trim()
  if (!raw) return fallback
  if (/medusa|localhost|publishable|stack|t-?bank|ключ/i.test(raw)) {
    return fallback
  }
  if (/[A-Za-z]{3,}/.test(raw) && !/[А-Яа-яЁё]/.test(raw)) {
    return fallback
  }
  return raw
}

export function formatPrice(amount, currency = "RUB") {
  if (amount == null || Number.isNaN(Number(amount))) return ""
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(Number(amount))
}

export function priceParts(calc) {
  const currency = calc?.currency_code || "rub"
  const current = Number(calc?.calculated_amount)
  const original = Number(calc?.original_amount)
  const hasCurrent = Number.isFinite(current)
  const onSale =
    hasCurrent &&
    Number.isFinite(original) &&
    original > current
  return {
    current: hasCurrent ? formatPrice(current, currency) : formatPrice(original, currency),
    original: onSale ? formatPrice(original, currency) : "",
    onSale,
  }
}

export function productPriceParts(product) {
  return priceParts(product?.variants?.[0]?.calculated_price)
}

export function variantPriceParts(variant) {
  return priceParts(variant?.calculated_price)
}

export function productPrice(product) {
  return productPriceParts(product).current
}

export function variantPrice(variant) {
  return variantPriceParts(variant).current
}

export function productImage(product) {
  return product?.thumbnail || product?.images?.[0]?.url || ""
}

export function productGroup(product) {
  const collection = product?.collection
  if (!collection?.id) return null
  return {
    id: collection.id,
    title: collection.title,
    path: `/collections/${collection.id}`,
  }
}

export function ruModels(n) {
  const abs = Math.abs(n) % 100
  const last = abs % 10
  if (abs > 10 && abs < 20) return `${n} моделей`
  if (last === 1) return `${n} модель`
  if (last >= 2 && last <= 4) return `${n} модели`
  return `${n} моделей`
}

export async function listShopGroups() {
  const [{ collections }, { products }] = await Promise.all([
    sdk.store.collection.list({
      limit: 100,
      fields: "id,title,handle",
    }),
    sdk.store.product.list({
      limit: 200,
      fields: "id,thumbnail,*images,collection_id",
    }),
  ])
  const imagesByGroup = new Map()
  const countByGroup = new Map()
  for (const product of products || []) {
    const id = product.collection_id
    if (!id) continue
    countByGroup.set(id, (countByGroup.get(id) || 0) + 1)
    const src = product.thumbnail || product.images?.[0]?.url
    if (!src) continue
    const list = imagesByGroup.get(id) || []
    if (list.length < 4) list.push(src)
    imagesByGroup.set(id, list)
  }
  return (collections || [])
    .map((collection) => ({
      id: collection.id,
      title: collection.title,
      path: `/collections/${collection.id}`,
      images: imagesByGroup.get(collection.id) || [],
      count: countByGroup.get(collection.id) || 0,
    }))
    .filter((group) => group.count > 0)
}

/**
 * PIM descriptions are plain text with \n / \n\n, sometimes light HTML.
 * Marketplace "Характеристики товара" dump is shown as the spec table instead.
 */
export function descriptionParagraphs(raw) {
  if (!raw) return []
  let text = String(raw)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\r\n/g, "\n")
    .replace(/\n*[^\n]*Характеристики товара:[\s\S]*$/i, "")
  return text
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
}
