import Medusa from "@medusajs/js-sdk"

export const BACKEND_URL =
  import.meta.env.VITE_MEDUSA_BACKEND_URL || "http://localhost:9000"

export let REGION_ID = ""
let publishableKey = ""
const CONFIG_KEY = "shop_storefront_config"

export let sdk = new Medusa({
  baseUrl: BACKEND_URL,
  publishableKey: "",
  debug: false,
})

export function storeHeaders() {
  return { "x-publishable-api-key": publishableKey }
}

function applyShopConfig(data) {
  REGION_ID = data.region_id || REGION_ID || ""
  publishableKey = data.publishable_key || publishableKey || ""
  sdk = new Medusa({
    baseUrl: BACKEND_URL,
    publishableKey,
    debug: false,
  })
}

function readCachedConfig() {
  try {
    const raw = localStorage.getItem(CONFIG_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export async function loadShopConfig() {
  const cached = readCachedConfig()
  if (cached?.publishable_key) applyShopConfig(cached)
  try {
    const res = await fetch(`${BACKEND_URL}/hooks/storefront-config`)
    if (!res.ok) {
      if (cached?.publishable_key) return
      throw new Error("Не удалось получить настройки витрины")
    }
    const data = await res.json()
    if (!data.publishable_key && cached?.publishable_key) return
    applyShopConfig(data)
    if (data.publishable_key) {
      localStorage.setItem(
        CONFIG_KEY,
        JSON.stringify({
          publishable_key: data.publishable_key,
          region_id: data.region_id || "",
        })
      )
    }
  } catch (error) {
    if (cached?.publishable_key) return
    throw error
  }
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
  "id,title,handle,thumbnail,description,collection_id,*variants.calculated_price,+variants.inventory_quantity,+variants.sku,+variants.metadata,*images,*collection,categories.id,categories.name,categories.handle,+metadata"

export { productSpecs } from "./product-specs.js"

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

export function ruFigures(n) {
  const abs = Math.abs(n) % 100
  const last = abs % 10
  if (abs > 10 && abs < 20) return `${n} фигурок`
  if (last === 1) return `${n} фигурка`
  if (last >= 2 && last <= 4) return `${n} фигурки`
  return `${n} фигурок`
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
