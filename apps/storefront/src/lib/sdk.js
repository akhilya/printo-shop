import Medusa from "@medusajs/js-sdk"
export { shopError } from "./shop-error.js"

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

export const PAGE_SIZE = 20
export const HOME_GROUPS = 8
export const HOME_PRODUCTS = 16

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
  "id,title,handle,thumbnail,description,collection_id,*variants.calculated_price,+variants.inventory_quantity,+variants.manage_inventory,+variants.sku,+variants.metadata,*images,*collection,categories.id,categories.name,categories.handle,+metadata"

export { productSpecs } from "./product-specs.js"

export function realVariants(product) {
  const variants = product?.variants || []
  if (variants.length <= 1) return []
  return variants
}

export function moneyAmount(value) {
  if (value == null || value === "") return null
  if (typeof value === "number") return Number.isFinite(value) ? value : null
  if (typeof value === "object") {
    return moneyAmount(value.numeric ?? value.value ?? value.amount)
  }
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

export function formatPrice(amount, currency = "RUB") {
  const value = moneyAmount(amount)
  if (value == null) return ""
  const code = String(currency || "RUB").toUpperCase()
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: /^[A-Z]{3}$/.test(code) ? code : "RUB",
    maximumFractionDigits: 0,
  }).format(value)
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

export async function listShopCatalog({
  q,
  categoryId,
  collectionId,
  inStock = false,
  limit = PAGE_SIZE,
  offset = 0,
} = {}) {
  const params = new URLSearchParams()
  if (q) params.set("q", q)
  if (categoryId) params.set("category_id", categoryId)
  if (collectionId) params.set("collection_id", collectionId)
  if (inStock) params.set("in_stock", "1")
  params.set("limit", String(limit))
  params.set("offset", String(offset))
  const res = await fetch(`${BACKEND_URL}/store/shop-catalog?${params}`, {
    headers: storeHeaders(),
  })
  if (!res.ok) throw new Error("catalog")
  const data = await res.json()
  return {
    products: data.products || [],
    count: data.count || 0,
  }
}

export async function listShopGroups() {
  const res = await fetch(`${BACKEND_URL}/store/shop-groups`, {
    headers: storeHeaders(),
  })
  if (!res.ok) throw new Error("groups")
  const data = await res.json()
  return data.groups || []
}

export async function loadLuckyProduct(excludeId) {
  const params = new URLSearchParams()
  if (excludeId) params.set("exclude", excludeId)
  const query = params.toString()
  const res = await fetch(
    `${BACKEND_URL}/store/shop-lucky${query ? `?${query}` : ""}`,
    { headers: storeHeaders() }
  )
  if (!res.ok) return null
  const data = await res.json()
  const slim = data.product
  if (!slim?.id && !slim?.handle) return null
  const { products } = await sdk.store.product.list({
    id: slim.id ? [slim.id] : undefined,
    handle: slim.handle || undefined,
    limit: 1,
    region_id: REGION_ID,
    fields: productFields,
  })
  return products?.[0] || null
}

export async function recordProductView(productId) {
  if (!productId) return
  try {
    await fetch(
      `${BACKEND_URL}/store/shop-products/${encodeURIComponent(productId)}/view`,
      { method: "POST", headers: storeHeaders() }
    )
  } catch {
    // Views are internal; a failed ping must not affect the page.
  }
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
