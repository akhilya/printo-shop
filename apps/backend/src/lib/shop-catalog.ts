import { MedusaContainer } from "@medusajs/framework"
import type { IProductModuleService } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import {
  applyShopGroupCoverImages,
  readShopCollectionCover,
  type ShopGroupProductImage,
} from "./shop-collection-cover"

export const SHOP_VIEWS_KEY = "shop_views"

const CATALOG_PAGE = 1000
const CATALOG_CAP = 10000
const ID_CHUNK = 1000
const CATALOG_TTL_MS = 60_000
const IN_STOCK_PREVIEW_BATCH = 200
const IN_STOCK_PREVIEW_CAP = IN_STOCK_PREVIEW_BATCH * 2
const PRODUCT_LIST_SELECT = [
  "id",
  "title",
  "handle",
  "thumbnail",
  "status",
  "collection_id",
  "metadata",
] as const
const VARIANT_LIST_SELECT = [
  "id",
  "product_id",
  "sku",
  "manage_inventory",
  "metadata",
] as const
const PRODUCT_LIST_RELATIONS = ["categories"]
const CATALOG_META_KEYS = [
  "price",
  "old_price",
  "sale_price",
  "attributes",
  "brand",
  SHOP_VIEWS_KEY,
] as const

type CatalogLevel = {
  available_quantity?: number | null
  stocked_quantity?: number | null
  reserved_quantity?: number | null
}

type CatalogInventoryItem = {
  inventory_item_id?: string | null
  required_quantity?: number | null
  inventory?: { location_levels?: CatalogLevel[] | null } | null
}

type CatalogVariant = {
  id?: string | null
  sku?: string | null
  manage_inventory?: boolean | null
  inventory_quantity?: number | null
  amount?: number | null
  metadata?: Record<string, unknown> | null
  inventory_items?: CatalogInventoryItem[] | null
}

export type CatalogRow = {
  id: string
  title?: string | null
  handle?: string | null
  thumbnail?: string | null
  collection_id?: string | null
  status?: string | null
  metadata?: Record<string, unknown> | null
  images?: Array<{ url?: string | null }> | null
  categories?: Array<{ id?: string | null }> | null
  variants?: CatalogVariant[] | null
}

export function applyInventoryItemQuantities(
  rows: CatalogRow[],
  qtyByItem: Record<string, number>
) {
  for (const row of rows) {
    for (const variant of row.variants || []) {
      if (variant.manage_inventory === false) {
        variant.inventory_quantity = 1
        continue
      }
      const items = variant.inventory_items || []
      if (!items.length) continue
      let min = Infinity
      for (const item of items) {
        const id = String(item.inventory_item_id || "")
        const available = Number(qtyByItem[id] || 0)
        const required = Math.max(1, Number(item.required_quantity) || 1)
        min = Math.min(min, Math.floor(available / required))
      }
      if (Number.isFinite(min)) variant.inventory_quantity = min
    }
  }
  return rows
}

export function catalogNeedle(value: unknown) {
  return String(value || "")
    .normalize("NFKC")
    .toLocaleLowerCase("ru")
    .replace(/ё/g, "е")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
}

const LATIN_TO_CYRILLIC: Record<string, string> = {
  a: "а", b: "б", v: "в", g: "г", d: "д", e: "е", z: "з", i: "и",
  k: "к", l: "л", m: "м", n: "н", o: "о", p: "п", r: "р", s: "с",
  t: "т", u: "у", f: "ф", h: "х", c: "ц", y: "ы",
}
const KEYBOARD_LAYOUT = "qwertyuiop[]asdfghjkl;'zxcvbnm,."
const RUSSIAN_LAYOUT = "йцукенгшщзхъфывапролджэячсмитьбю"

function transliterateToCyrillic(value: string) {
  return value
    .replace(/shch/g, "щ")
    .replace(/zh/g, "ж")
    .replace(/ch/g, "ч")
    .replace(/sh/g, "ш")
    .replace(/ts/g, "ц")
    .replace(/kh/g, "х")
    .replace(/yu/g, "ю")
    .replace(/ya/g, "я")
    .replace(/[abvgdeziklmnoprstufhcy]/g, (letter) => LATIN_TO_CYRILLIC[letter] || letter)
}

function searchForms(value: string) {
  const forms = new Set([value])
  forms.add(transliterateToCyrillic(value))
  forms.add(value.replace(/[a-z\[\];',.]/g, (letter) => {
    const index = KEYBOARD_LAYOUT.indexOf(letter)
    return index < 0 ? letter : RUSSIAN_LAYOUT[index]
  }))
  return [...forms]
}

function editDistance(left: string, right: string) {
  const rows = Array.from({ length: left.length + 1 }, () =>
    Array.from({ length: right.length + 1 }, () => 0)
  )
  for (let i = 0; i <= left.length; i += 1) rows[i][0] = i
  for (let j = 0; j <= right.length; j += 1) rows[0][j] = j
  for (let i = 1; i <= left.length; i += 1) {
    for (let j = 1; j <= right.length; j += 1) {
      const substitution = rows[i - 1][j - 1] + Number(left[i - 1] !== right[j - 1])
      rows[i][j] = Math.min(
        rows[i - 1][j] + 1,
        rows[i][j - 1] + 1,
        substitution
      )
      if (i > 1 && j > 1 && left[i - 1] === right[j - 2] && left[i - 2] === right[j - 1]) {
        rows[i][j] = Math.min(rows[i][j], rows[i - 2][j - 2] + 1)
      }
    }
  }
  return rows[left.length][right.length]
}

function searchTokenMatches(query: string, word: string) {
  if (word === query || word.startsWith(query)) return true
  if (query.length < 4) return false
  const maxDistance = query.length >= 5 ? 2 : 1
  const minLength = Math.max(1, query.length - maxDistance)
  const maxLength = Math.min(word.length, query.length + maxDistance)
  for (let length = minLength; length <= maxLength; length += 1) {
    if (editDistance(query, word.slice(0, length)) <= maxDistance) return true
  }
  return false
}

function nearestTokenSimilarity(query: string, words: string[]) {
  if (!query || !words.length) return 0
  let best = 0
  for (const word of words) {
    const minLength = Math.max(1, Math.min(query.length, word.length) - 2)
    const maxLength = Math.min(word.length, query.length + 2)
    let distance = editDistance(query, word)
    for (let length = minLength; length <= maxLength; length += 1) {
      distance = Math.min(distance, editDistance(query, word.slice(0, length)))
    }
    const similarity = 1 - distance / Math.max(query.length, word.length, 1)
    best = Math.max(best, similarity)
  }
  return best
}

function catalogSearchText(row: CatalogRow) {
  const metadata = row.metadata || {}
  const attributes = metadata.attributes
  const attributeText =
    typeof attributes === "string"
      ? attributes
      : attributes && typeof attributes === "object"
        ? Object.values(attributes).join(" ")
        : ""
  return [
    row.title,
    row.handle,
    ...(row.variants || []).map((variant) => variant.sku),
    metadata.brand,
    attributeText,
  ]
    .filter((value) => typeof value === "string")
    .join(" ")
}

export function catalogSearchScore(row: CatalogRow, query: string) {
  const needle = catalogNeedle(query)
  if (!needle) return 1
  const forms = searchForms(needle)
  const title = catalogNeedle(row.title)
  const searchable = catalogNeedle(catalogSearchText(row))
  const words = searchable.split(/\s+/).filter(Boolean)
  let score = 0
  for (const form of forms) {
    if (title === form) score = Math.max(score, 120)
    else if (title.startsWith(form)) score = Math.max(score, 100)
    else if (title.includes(form)) score = Math.max(score, 80)
    else if (searchable.includes(form)) score = Math.max(score, 60)
    const tokens = form.split(/\s+/).filter(Boolean)
    const matched = tokens.filter((token) =>
      words.some((word) => searchTokenMatches(token, word))
    ).length
    if (tokens.length && matched === tokens.length) {
      score = Math.max(score, 70 + tokens.length)
    }
  }
  if (!score) {
    const tokens = needle.split(/\s+/).filter(Boolean)
    const similarities = tokens.map((token) =>
      Math.max(...searchForms(token).map((form) => nearestTokenSimilarity(form, words)))
    )
    const average = similarities.reduce((sum, value) => sum + value, 0) / similarities.length
    // Keep a positive score so even an unrelated query returns its closest products.
    score = 1 + average * 30
  }
  return score
}

export function variantCatalogQuantity(variant: CatalogVariant) {
  if (variant.manage_inventory === false) return 1
  const qty = Number(variant.inventory_quantity)
  if (Number.isFinite(qty)) return qty
  const items = variant.inventory_items || []
  if (!items.length) return 0
  let min = Infinity
  for (const item of items) {
    const levels = item.inventory?.location_levels || []
    const available = levels.reduce((sum, level) => {
      const avail = Number(level.available_quantity)
      if (Number.isFinite(avail)) return sum + Math.max(0, avail)
      const stocked = Number(level.stocked_quantity) || 0
      const reserved = Number(level.reserved_quantity) || 0
      return sum + Math.max(0, stocked - reserved)
    }, 0)
    const required = Math.max(1, Number(item.required_quantity) || 1)
    min = Math.min(min, Math.floor(available / required))
  }
  return Number.isFinite(min) ? min : 0
}

export function catalogProductInStock(row: CatalogRow) {
  const variants = row.variants || []
  if (!variants.length) return false
  return variants.some((variant) => variantCatalogQuantity(variant) > 0)
}

export function productMatchesCatalogQuery(row: CatalogRow, needle: string) {
  if (!needle) return true
  return catalogSearchScore(row, needle) > 0
}

export function catalogUsesMemory(cache: { count: number; partial: boolean }) {
  return cache.count > 0 && !cache.partial
}

export function canPreviewInStockPage(input: {
  q?: string | null
  category_id?: string | null
  collection_id?: string | null
  in_stock?: boolean
  offset?: number
  limit?: number
}) {
  if (!input.in_stock) return false
  if (catalogNeedle(input.q)) return false
  if (String(input.category_id || "").trim()) return false
  if (String(input.collection_id || "").trim()) return false
  const offset = Math.max(0, Number(input.offset) || 0)
  const limit = Math.min(Math.max(Number(input.limit) || 20, 1), 100)
  return offset + limit <= IN_STOCK_PREVIEW_BATCH
}

export function sortCatalogByAvailability(rows: CatalogRow[]) {
  return [...rows].sort((a, b) => {
    return Number(catalogProductInStock(b)) - Number(catalogProductInStock(a))
  })
}

export function pageCatalogIds(rows: CatalogRow[], offset: number, limit: number) {
  const start = Math.max(0, Number(offset) || 0)
  const size = Math.min(Math.max(Number(limit) || 20, 1), 100)
  return {
    ids: rows.slice(start, start + size).map((row) => row.id),
    count: rows.length,
  }
}

function catalogMoney(value: unknown) {
  const amount = Number(value)
  return Number.isFinite(amount) && amount >= 0 ? amount : null
}

export function catalogSellingAmount(
  metadata: Record<string, unknown> | null | undefined,
  variant?: CatalogVariant | null
) {
  if (variant?.amount != null) {
    const live = catalogMoney(variant.amount)
    if (live != null) return live
  }
  const source = metadata || {}
  const price = catalogMoney(source.price)
  const sale = catalogMoney(source.sale_price)
  const old =
    catalogMoney(variant?.metadata?.old_price) ?? catalogMoney(source.old_price)
  if (price != null && old != null) return price
  if (sale != null && sale > 0 && (price == null || sale < price)) return sale
  return price ?? sale
}

export function applyVariantPrices(
  rows: CatalogRow[],
  amountByVariant: Record<string, number>
) {
  for (const row of rows) {
    for (const variant of row.variants || []) {
      const id = String(variant.id || "")
      if (!id || amountByVariant[id] == null) continue
      variant.amount = amountByVariant[id]
    }
  }
  return rows
}

export function presentCatalogProduct(row: CatalogRow) {
  const metadata = (row.metadata || {}) as Record<string, unknown>
  const variants = row.variants || []
  const first = variants[0]
  const current = catalogSellingAmount(metadata, first)
  const listedOld =
    catalogMoney(first?.metadata?.old_price) ?? catalogMoney(metadata.old_price)
  const original =
    listedOld != null && current != null && listedOld > current
      ? listedOld
      : current
  return {
    id: row.id,
    title: row.title || "",
    handle: row.handle || "",
    thumbnail: row.thumbnail || null,
    collection_id: row.collection_id || null,
    metadata: slimCatalogMetadata(metadata),
    images: row.thumbnail ? [{ url: String(row.thumbnail) }] : [],
    categories: (row.categories || []).map((category) => ({
      id: String(category.id || ""),
    })),
    variants: variants.map((variant) => ({
      id: variant.id || undefined,
      sku: variant.sku || undefined,
      manage_inventory: variant.manage_inventory,
      inventory_quantity: variant.inventory_quantity,
      metadata: slimCatalogMetadata(variant.metadata),
      calculated_price:
        current == null
          ? null
          : {
              calculated_amount: current,
              original_amount: original,
              currency_code: "rub",
            },
    })),
  }
}

export function slimCatalogMetadata(metadata: unknown) {
  const source = (metadata || {}) as Record<string, unknown>
  const next: Record<string, unknown> = {}
  for (const key of CATALOG_META_KEYS) {
    if (source[key] != null && source[key] !== "") next[key] = source[key]
  }
  return next
}

function slimCatalogRow(row: CatalogRow): CatalogRow {
  return {
    id: row.id,
    title: row.title || "",
    handle: row.handle || "",
    thumbnail: row.thumbnail || null,
    collection_id: row.collection_id || null,
    metadata: slimCatalogMetadata(row.metadata),
    categories: (row.categories || []).map((category) => ({
      id: String(category.id || ""),
    })),
    variants: (row.variants || []).map((variant) => ({
      id: variant.id,
      sku: variant.sku,
      manage_inventory: variant.manage_inventory,
      inventory_quantity: variant.inventory_quantity,
      amount: catalogMoney(variant.amount),
      metadata: slimCatalogMetadata(variant.metadata),
    })),
  }
}

type ProductListRow = {
  id?: string | null
  title?: string | null
  handle?: string | null
  thumbnail?: string | null
  collection_id?: string | null
  status?: string | null
  metadata?: Record<string, unknown> | null
  categories?: Array<{ id?: string | null }> | null
  variants?: CatalogVariant[] | null
}

export function projectProductListRows(products: ProductListRow[]): CatalogRow[] {
  return products.map((product) => ({
    id: String(product.id || ""),
    title: product.title || "",
    handle: product.handle || "",
    thumbnail: product.thumbnail || null,
    collection_id: product.collection_id || null,
    status: product.status || null,
    metadata: slimCatalogMetadata(product.metadata),
    categories: (product.categories || [])
      .map((category) => ({ id: String(category.id || "") }))
      .filter((category) => category.id),
    variants: (product.variants || []).map((variant) => ({
      id: variant.id,
      sku: variant.sku,
      manage_inventory: variant.manage_inventory,
      metadata: slimCatalogMetadata(variant.metadata),
      inventory_items: (variant.inventory_items || []).map((item) => ({
        inventory_item_id: item.inventory_item_id,
        required_quantity: item.required_quantity,
      })),
    })),
  }))
}

export function attachVariantInventoryLinks(
  rows: CatalogRow[],
  links: Array<{
    variant_id?: string | null
    inventory_item_id?: string | null
    required_quantity?: number | null
  }>
) {
  const byVariant = new Map<string, CatalogInventoryItem[]>()
  for (const link of links) {
    const variantId = String(link.variant_id || "")
    const itemId = String(link.inventory_item_id || "")
    if (!variantId || !itemId) continue
    const list = byVariant.get(variantId) || []
    list.push({
      inventory_item_id: itemId,
      required_quantity: link.required_quantity,
    })
    byVariant.set(variantId, list)
  }
  for (const row of rows) {
    for (const variant of row.variants || []) {
      const id = String(variant.id || "")
      const items = byVariant.get(id)
      if (items) variant.inventory_items = items
    }
  }
  return rows
}

function productModuleOf(container: MedusaContainer) {
  return container.resolve(Modules.PRODUCT) as IProductModuleService
}

function chunkIds(ids: string[], size = ID_CHUNK) {
  const unique = [...new Set(ids.filter(Boolean))]
  const chunks: string[][] = []
  for (let index = 0; index < unique.length; index += size) {
    chunks.push(unique.slice(index, index + size))
  }
  return chunks
}

export function pageCatalogProducts(
  rows: CatalogRow[],
  offset: number,
  limit: number
) {
  const start = Math.max(0, Number(offset) || 0)
  const size = Math.min(Math.max(Number(limit) || 20, 1), 100)
  return {
    products: rows.slice(start, start + size).map(presentCatalogProduct),
    count: rows.length,
  }
}

export function pickLuckyCatalogRows(
  rows: CatalogRow[],
  count = 1,
  excludeId?: string | null
) {
  const size = Math.min(Math.max(Number(count) || 1, 1), 3)
  const available = rows.filter(
    (row) => row.id !== excludeId && catalogProductInStock(row)
  )
  const pool = (
    available.length ? available : rows.filter((row) => row.id !== excludeId)
  ).slice()
  for (let i = pool.length - 1; i > 0; i--) {
    const swap = Math.floor(Math.random() * (i + 1))
    const current = pool[i]
    pool[i] = pool[swap]
    pool[swap] = current
  }
  return pool.slice(0, size)
}

export function pickLuckyCatalogRow(rows: CatalogRow[], excludeId?: string | null) {
  return pickLuckyCatalogRows(rows, 1, excludeId)[0] || null
}

function dailyProductScore(row: CatalogRow, day: string) {
  const views = Math.max(0, Number(row.metadata?.[SHOP_VIEWS_KEY]) || 0)
  let hash = 2166136261
  for (const char of `${day}:${row.id}`) {
    hash ^= char.charCodeAt(0)
    hash = Math.imul(hash, 16777619)
  }
  const rotation = (hash >>> 0) / 0xffffffff
  return Math.log1p(views) * 0.65 + rotation * 0.35
}

export function pickDiverseCatalogRows(
  rows: CatalogRow[],
  count: number,
  excludeIds: string[] = [],
  now = new Date()
) {
  const day = `${now.getUTCFullYear()}-${now.getUTCMonth()}-${now.getUTCDate()}`
  const excluded = new Set(excludeIds)
  const candidates = rows
    .filter((row) => !excluded.has(row.id) && catalogProductInStock(row))
    .sort((a, b) => dailyProductScore(b, day) - dailyProductScore(a, day))
  const picked: CatalogRow[] = []
  const collectionCounts = new Map<string, number>()
  while (candidates.length && picked.length < count) {
    const index = candidates.findIndex((row) => {
      const collection = String(row.collection_id || "")
      return !collection || (collectionCounts.get(collection) || 0) < 2
    })
    const [row] = candidates.splice(index < 0 ? 0 : index, 1)
    picked.push(row)
    if (row.collection_id) {
      collectionCounts.set(
        row.collection_id,
        (collectionCounts.get(row.collection_id) || 0) + 1
      )
    }
  }
  return picked
}

let catalogCache: { at: number; rows: CatalogRow[]; partial: boolean } = {
  at: 0,
  rows: [],
  partial: false,
}
let catalogInflight: Promise<CatalogRow[]> | null = null
let catalogRefreshTimer: ReturnType<typeof setTimeout> | null = null
const CATALOG_REFRESH_DELAY_MS = 200
let groupsCache: {
  catalogAt: number
  groups: Array<{
    id: string
    title: string
    path: string
    images: ReturnType<typeof applyShopGroupCoverImages>
    count: number
  }>
} | null = null

export function invalidateShopCatalogCache() {
  catalogCache = { at: 0, rows: [], partial: false }
  groupsCache = null
  if (catalogRefreshTimer) {
    clearTimeout(catalogRefreshTimer)
    catalogRefreshTimer = null
  }
}

function seedCatalogPreview(rows: CatalogRow[]) {
  if (catalogCache.rows.length && !catalogCache.partial) return
  catalogCache = { at: Date.now(), rows, partial: true }
}

function refreshCatalogInBackground(container: MedusaContainer) {
  if (catalogRefreshTimer) {
    clearTimeout(catalogRefreshTimer)
    catalogRefreshTimer = null
  }
  if (catalogInflight) return catalogInflight
  catalogInflight = loadPublishedCatalogRows(container)
    .then((rows) => {
      catalogCache = {
        at: Date.now(),
        rows: sortCatalogByAvailability(rows),
        partial: false,
      }
      groupsCache = null
      return catalogCache.rows
    })
    .catch((error) => {
      if (catalogCache.rows.length) return catalogCache.rows
      throw error
    })
    .finally(() => {
      catalogInflight = null
    })
  return catalogInflight
}

function scheduleCatalogRefresh(container: MedusaContainer, delayMs = 0) {
  if (catalogInflight) return catalogInflight
  if (!delayMs) return refreshCatalogInBackground(container)
  if (catalogRefreshTimer) return catalogInflight
  catalogRefreshTimer = setTimeout(() => {
    catalogRefreshTimer = null
    refreshCatalogInBackground(container)
  }, delayMs)
  return catalogInflight
}

function inventoryModuleOf(container: MedusaContainer) {
  return container.resolve(Modules.INVENTORY) as {
    listInventoryLevels: (
      filters: Record<string, unknown>,
      config?: Record<string, unknown>
    ) => Promise<
      Array<{
        inventory_item_id?: string
        stocked_quantity?: number
        reserved_quantity?: number
      }>
    >
  }
}

function addLevelQuantities(
  qty: Record<string, number>,
  levels: Array<{
    inventory_item_id?: string
    stocked_quantity?: number
    reserved_quantity?: number
  }>
) {
  for (const level of levels) {
    const id = String(level.inventory_item_id || "")
    if (!id) continue
    const available = Math.max(
      0,
      (Number(level.stocked_quantity) || 0) -
        (Number(level.reserved_quantity) || 0)
    )
    qty[id] = (qty[id] || 0) + available
  }
  return qty
}

function inventoryItemIdsFromRows(rows: CatalogRow[]) {
  const ids: string[] = []
  for (const row of rows) {
    for (const variant of row.variants || []) {
      for (const item of variant.inventory_items || []) {
        const id = String(item.inventory_item_id || "")
        if (id) ids.push(id)
      }
    }
  }
  return ids
}

function variantIdsFromRows(rows: CatalogRow[]) {
  const ids: string[] = []
  for (const row of rows) {
    for (const variant of row.variants || []) {
      const id = String(variant.id || "")
      if (id) ids.push(id)
    }
  }
  return ids
}

function inventoryLinkService(container: MedusaContainer) {
  const remoteLink = container.resolve(ContainerRegistrationKeys.LINK) as {
    getLinkModule: (
      from: string,
      fromKey: string,
      to: string,
      toKey: string
    ) => {
      list: (
        filters: Record<string, unknown>,
        config?: Record<string, unknown>
      ) => Promise<
        Array<{
          variant_id?: string
          inventory_item_id?: string
          required_quantity?: number
        }>
      >
    }
  }
  return remoteLink.getLinkModule(
    Modules.PRODUCT,
    "variant_id",
    Modules.INVENTORY,
    "inventory_item_id"
  )
}

async function listVariantInventoryLinks(
  container: MedusaContainer,
  variantIds: string[]
) {
  const chunks = chunkIds(variantIds)
  if (!chunks.length) return []
  const linkService = inventoryLinkService(container)
  const links: Array<{
    variant_id?: string
    inventory_item_id?: string
    required_quantity?: number
  }> = []
  for (const chunk of chunks) {
    const rows = await linkService.list(
      { variant_id: chunk },
      {
        take: Math.min(chunk.length * 8, CATALOG_CAP),
        select: ["variant_id", "inventory_item_id", "required_quantity"],
      }
    )
    links.push(...rows)
  }
  return links
}

function priceLinkService(container: MedusaContainer) {
  const remoteLink = container.resolve(ContainerRegistrationKeys.LINK) as {
    getLinkModule: (
      from: string,
      fromKey: string,
      to: string,
      toKey: string
    ) => {
      list: (
        filters: Record<string, unknown>,
        config?: Record<string, unknown>
      ) => Promise<Array<{ variant_id?: string; price_set_id?: string }>>
    }
  }
  return remoteLink.getLinkModule(
    Modules.PRODUCT,
    "variant_id",
    Modules.PRICING,
    "price_set_id"
  )
}

async function listVariantPriceAmounts(
  container: MedusaContainer,
  variantIds: string[]
) {
  const chunks = chunkIds(variantIds)
  if (!chunks.length) return {}
  const linkService = priceLinkService(container)
  const pricing = container.resolve(Modules.PRICING) as {
    listPrices: (
      filters: Record<string, unknown>,
      config?: Record<string, unknown>
    ) => Promise<
      Array<{
        price_set_id?: string
        amount?: number | null
        currency_code?: string | null
        price_list_id?: string | null
      }>
    >
  }
  const amountByVariant: Record<string, number> = {}
  for (const chunk of chunks) {
    const links = await linkService.list(
      { variant_id: chunk },
      {
        take: Math.min(chunk.length * 4, CATALOG_CAP),
        select: ["variant_id", "price_set_id"],
      }
    )
    const setToVariant = new Map<string, string>()
    for (const link of links) {
      const variantId = String(link.variant_id || "")
      const setId = String(link.price_set_id || "")
      if (variantId && setId) setToVariant.set(setId, variantId)
    }
    const setIds = [...setToVariant.keys()]
    if (!setIds.length) continue
    const prices = await pricing.listPrices(
      { price_set_id: setIds },
      {
        take: Math.min(setIds.length * 8, CATALOG_CAP),
        select: ["price_set_id", "amount", "currency_code", "price_list_id"],
      }
    )
    const ranked = [...prices].sort((a, b) => {
      return Number(Boolean(a.price_list_id)) - Number(Boolean(b.price_list_id))
    })
    for (const price of ranked) {
      const variantId = setToVariant.get(String(price.price_set_id || ""))
      if (!variantId || amountByVariant[variantId] != null) continue
      const code = String(price.currency_code || "rub").toLowerCase()
      if (code !== "rub") continue
      const amount = catalogMoney(price.amount)
      if (amount == null) continue
      amountByVariant[variantId] = amount
    }
  }
  return amountByVariant
}

async function attachLiveVariantPrices(
  container: MedusaContainer,
  rows: CatalogRow[]
) {
  const amounts = await listVariantPriceAmounts(
    container,
    variantIdsFromRows(rows)
  ).catch(() => ({}))
  return applyVariantPrices(rows, amounts)
}

async function listQtyForInventoryItems(
  container: MedusaContainer,
  itemIds: string[]
) {
  const chunks = chunkIds(itemIds)
  if (!chunks.length) return {}
  const inventory = inventoryModuleOf(container)
  const qty: Record<string, number> = {}
  for (const chunk of chunks) {
    const levels = await inventory.listInventoryLevels(
      { inventory_item_id: chunk },
      {
        take: Math.min(chunk.length * 8, CATALOG_CAP),
        select: ["inventory_item_id", "stocked_quantity", "reserved_quantity"],
      }
    )
    addLevelQuantities(qty, levels)
  }
  return qty
}

function variantsByProductId(
  variants: Array<{
    id?: string
    sku?: string | null
    manage_inventory?: boolean | null
    metadata?: Record<string, unknown> | null
    product_id?: string | null
  }>,
  allowedProductIds?: Set<string>
) {
  const byProduct = new Map<string, CatalogVariant[]>()
  for (const variant of variants) {
    const productId = String(variant.product_id || "")
    if (!productId) continue
    if (allowedProductIds && !allowedProductIds.has(productId)) continue
    const list = byProduct.get(productId) || []
    list.push({
      id: variant.id,
      sku: variant.sku,
      manage_inventory: variant.manage_inventory,
      metadata: variant.metadata || null,
    })
    byProduct.set(productId, list)
  }
  return byProduct
}

function catalogRowsFromProducts(
  products: ProductListRow[],
  variants: Array<{
    id?: string
    sku?: string | null
    manage_inventory?: boolean | null
    metadata?: Record<string, unknown> | null
    product_id?: string | null
  }>
) {
  const byProduct = variantsByProductId(
    variants,
    new Set(products.map((row) => String(row.id || "")))
  )
  return projectProductListRows(
    products.map((row) => ({
      ...row,
      variants: byProduct.get(String(row.id || "")) || [],
    }))
  )
}

async function listPublishedProductPage(
  container: MedusaContainer,
  skip: number,
  take: number
) {
  const product = productModuleOf(container)
  const products = await product.listProducts(
    { status: "published" },
    {
      skip,
      take,
      select: [...PRODUCT_LIST_SELECT, "categories.id"],
      relations: PRODUCT_LIST_RELATIONS,
    }
  )
  if (!products.length) return [] as CatalogRow[]
  const ids = products.map((row) => String(row.id))
  const variants = await product.listProductVariants(
    { product_id: ids },
    {
      take: Math.min(Math.max(ids.length * 8, ids.length), CATALOG_CAP),
      select: [...VARIANT_LIST_SELECT],
    }
  )
  return catalogRowsFromProducts(
    products as ProductListRow[],
    variants as Array<{
      id?: string
      sku?: string | null
      manage_inventory?: boolean | null
      metadata?: Record<string, unknown> | null
      product_id?: string | null
    }>
  )
}

async function hydrateCatalogInventory(
  container: MedusaContainer,
  rows: CatalogRow[]
) {
  if (!rows.length) return rows
  const links = await listVariantInventoryLinks(
    container,
    variantIdsFromRows(rows)
  ).catch(() => [])
  attachVariantInventoryLinks(rows, links)
  const qty = await listQtyForInventoryItems(
    container,
    inventoryItemIdsFromRows(rows)
  ).catch(() => ({}))
  applyInventoryItemQuantities(rows, qty)
  await attachLiveVariantPrices(container, rows)
  return rows.map(slimCatalogRow)
}

async function loadEnoughInStockRows(container: MedusaContainer, needed: number) {
  const inStock: CatalogRow[] = []
  const want = Math.max(1, needed)
  for (let skip = 0; skip < IN_STOCK_PREVIEW_CAP; skip += IN_STOCK_PREVIEW_BATCH) {
    const batch = await listPublishedProductPage(
      container,
      skip,
      IN_STOCK_PREVIEW_BATCH
    )
    if (!batch.length) break
    const rows = await hydrateCatalogInventory(container, batch)
    for (const row of rows) {
      if (!catalogProductInStock(row)) continue
      inStock.push(row)
      if (inStock.length >= want) return inStock
    }
    if (batch.length < IN_STOCK_PREVIEW_BATCH) break
  }
  return inStock
}

async function listAllInventoryQty(container: MedusaContainer) {
  const inventory = inventoryModuleOf(container)
  const levels = await inventory.listInventoryLevels(
    {},
    {
      take: CATALOG_CAP,
      select: ["inventory_item_id", "stocked_quantity", "reserved_quantity"],
    }
  )
  return addLevelQuantities({}, levels)
}

async function listAllVariantInventoryLinks(container: MedusaContainer) {
  return inventoryLinkService(container).list(
    {},
    {
      take: CATALOG_CAP,
      select: ["variant_id", "inventory_item_id", "required_quantity"],
    }
  )
}

async function loadPublishedCatalogRows(container: MedusaContainer) {
  const product = productModuleOf(container)
  const loadProducts = async () => {
    const rows: ProductListRow[] = []
    for (let skip = 0; skip < CATALOG_CAP; skip += CATALOG_PAGE) {
      const batch = await product.listProducts(
        { status: "published" },
        {
          skip,
          take: CATALOG_PAGE,
          select: [...PRODUCT_LIST_SELECT, "categories.id"],
          relations: PRODUCT_LIST_RELATIONS,
        }
      )
      rows.push(...(batch as ProductListRow[]))
      if (batch.length < CATALOG_PAGE) break
      await new Promise((resolve) => setImmediate(resolve))
    }
    return rows
  }
  const [products, variants, links, qty] = await Promise.all([
    loadProducts(),
    product.listProductVariants(
      {},
      { take: CATALOG_CAP, select: [...VARIANT_LIST_SELECT] }
    ),
    listAllVariantInventoryLinks(container).catch(() => []),
    listAllInventoryQty(container).catch(() => ({})),
  ])
  await new Promise((resolve) => setImmediate(resolve))
  const rows = catalogRowsFromProducts(
    products,
    variants as Array<{
      id?: string
      sku?: string | null
      manage_inventory?: boolean | null
      metadata?: Record<string, unknown> | null
      product_id?: string | null
    }>
  )
  const variantIds = variantIdsFromRows(rows)
  let resolvedLinks = links
  if (variantIds.length && resolvedLinks.length < variantIds.length) {
    resolvedLinks = await listVariantInventoryLinks(container, variantIds).catch(
      () => resolvedLinks
    )
  }
  attachVariantInventoryLinks(rows, resolvedLinks)
  const itemIds = inventoryItemIdsFromRows(rows)
  let resolvedQty = qty
  if (itemIds.length && Object.keys(resolvedQty).length < itemIds.length) {
    resolvedQty = {
      ...resolvedQty,
      ...(await listQtyForInventoryItems(container, itemIds).catch(() => ({}))),
    }
  }
  applyInventoryItemQuantities(rows, resolvedQty)
  await attachLiveVariantPrices(container, rows)
  return rows.map(slimCatalogRow)
}

function memoryCatalogRows() {
  if (!catalogUsesMemory({ count: catalogCache.rows.length, partial: catalogCache.partial })) {
    return null
  }
  return catalogCache.rows
}

function queueCatalogRefresh(container: MedusaContainer) {
  const fresh =
    memoryCatalogRows() && Date.now() - catalogCache.at < CATALOG_TTL_MS
  if (fresh) return
  scheduleCatalogRefresh(container, CATALOG_REFRESH_DELAY_MS)
}

export async function warmShopCatalog(container: MedusaContainer) {
  if (memoryCatalogRows() && Date.now() - catalogCache.at < CATALOG_TTL_MS) return
  await refreshCatalogInBackground(container)
}

export function catalogSitemapEntries() {
  const rows = memoryCatalogRows()
  if (!rows) return null
  const extra: Array<{ path: string; changefreq: string; priority: string }> = []
  for (const row of rows) {
    const handle = String(row.handle || "").trim()
    if (!handle) continue
    extra.push({
      path: `/p/${handle}`,
      changefreq: "weekly",
      priority: "0.7",
    })
  }
  return extra
}

function pageReadyCatalog(
  rows: CatalogRow[],
  input: {
    q?: string | null
    category_id?: string | null
    collection_id?: string | null
    in_stock?: boolean
    offset?: number
    limit?: number
  }
) {
  const needle = catalogNeedle(input.q)
  const categoryId = String(input.category_id || "").trim()
  const collectionId = String(input.collection_id || "").trim()
  let matched = rows
  if (needle || categoryId || collectionId || input.in_stock) {
    matched = rows.filter((row) => {
      if (needle && !productMatchesCatalogQuery(row, needle)) return false
      if (collectionId && String(row.collection_id || "") !== collectionId) {
        return false
      }
      if (categoryId) {
        const categories = row.categories || []
        if (!categories.some((item) => String(item.id || "") === categoryId)) {
          return false
        }
      }
      if (input.in_stock && !catalogProductInStock(row)) return false
      return true
    })
  }
  if (needle) {
    matched = matched
      .map((row, index) => ({ row, index, score: catalogSearchScore(row, needle) }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score || a.index - b.index)
      .map((item) => item.row)
  }
  return pageCatalogProducts(matched, input.offset || 0, input.limit || 20)
}

async function loadFastCatalogPage(
  container: MedusaContainer,
  input: {
    q?: string | null
    category_id?: string | null
    collection_id?: string | null
    in_stock?: boolean
    offset?: number
    limit?: number
  }
) {
  const product = productModuleOf(container)
  const filters: {
    status: "published"
    q?: string
    collection_id?: string
    categories?: { id: string }
  } = { status: "published" }
  const q = String(input.q || "").trim()
  const categoryId = String(input.category_id || "").trim()
  const collectionId = String(input.collection_id || "").trim()
  if (q) filters.q = q
  if (categoryId) filters.categories = { id: categoryId }
  if (collectionId) filters.collection_id = collectionId
  const limit = input.limit || 20
  const offset = input.offset || 0
  const [products, counted] = await Promise.all([
    product.listProducts(filters, {
      skip: offset,
      take: limit,
      select: [...PRODUCT_LIST_SELECT, "categories.id"],
      relations: PRODUCT_LIST_RELATIONS,
    }),
    product.listAndCountProducts(filters, {
      skip: 0,
      take: 1,
      select: ["id"],
    }),
  ])
  const count = Number(counted[1]) || 0
  if (!products.length) return { products: [], count }
  const ids = products.map((row) => String(row.id))
  const variants = await product.listProductVariants(
    { product_id: ids },
    {
      take: Math.min(Math.max(ids.length * 8, ids.length), CATALOG_CAP),
      select: [...VARIANT_LIST_SELECT],
    }
  )
  const rows = await hydrateCatalogInventory(
    container,
    catalogRowsFromProducts(
      products as ProductListRow[],
      variants as Array<{
        id?: string
        sku?: string | null
        manage_inventory?: boolean | null
        metadata?: Record<string, unknown> | null
        product_id?: string | null
      }>
    )
  )
  const visible = input.in_stock ? rows.filter(catalogProductInStock) : rows
  return {
    products: visible.map(presentCatalogProduct),
    count,
  }
}

export async function listShopCatalogPage(
  container: MedusaContainer,
  input: {
    q?: string | null
    category_id?: string | null
    collection_id?: string | null
    in_stock?: boolean
    offset?: number
    limit?: number
  }
) {
  const ready = memoryCatalogRows()
  if (ready) {
    queueCatalogRefresh(container)
    return pageReadyCatalog(ready, input)
  }
  const offset = input.offset || 0
  const limit = input.limit || 20
  if (canPreviewInStockPage(input) && catalogCache.partial && catalogCache.rows.length >= offset + limit) {
    queueCatalogRefresh(container)
    return pageCatalogProducts(catalogCache.rows, offset, limit)
  }
  if (canPreviewInStockPage(input) && !catalogCache.rows.length) {
    const rows = await loadEnoughInStockRows(container, offset + limit)
    seedCatalogPreview(rows)
    queueCatalogRefresh(container)
    return pageCatalogProducts(rows, offset, limit)
  }
  if (catalogNeedle(input.q)) {
    try {
      const rows = await refreshCatalogInBackground(container)
      return pageReadyCatalog(rows, input)
    } catch {
      // Fall back to the module query if the full catalog cannot be loaded.
    }
  }
  const page = await loadFastCatalogPage(container, input)
  queueCatalogRefresh(container)
  return page
}

export function presentShopGroups(
  collections: Array<Record<string, unknown>>,
  rows: Array<{
    id?: string | null
    collection_id?: string | null
    thumbnail?: string | null
  }>
) {
  const imagesByGroup = new Map<string, ShopGroupProductImage[]>()
  const countByGroup = new Map<string, number>()
  for (const product of rows) {
    const id = String(product.collection_id || "").trim()
    if (!id) continue
    countByGroup.set(id, (countByGroup.get(id) || 0) + 1)
    const src = product.thumbnail ? String(product.thumbnail) : ""
    if (!src) continue
    const list = imagesByGroup.get(id) || []
    list.push({ product_id: String(product.id), src })
    imagesByGroup.set(id, list)
  }
  return collections
    .map((collection) => {
      const id = String(collection.id || "")
      const images = applyShopGroupCoverImages(
        imagesByGroup.get(id) || [],
        readShopCollectionCover(collection.metadata)
      )
      const count = countByGroup.get(id) || 0
      return {
        id,
        title: String(collection.title || ""),
        path: `/collections/${id}`,
        images,
        count: count || (images.length ? 1 : 0),
      }
    })
    .filter((group) => group.id && (group.count > 0 || group.images.length))
}

async function listCollections(container: MedusaContainer) {
  const product = productModuleOf(container)
  const rows = await product.listProductCollections(
    {},
    { take: 200, select: ["id", "title", "handle", "metadata"] }
  )
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    handle: row.handle,
    metadata: row.metadata,
  }))
}

async function storeGroupsFromRows(
  container: MedusaContainer,
  rows: CatalogRow[]
) {
  const groups = presentShopGroups(await listCollections(container), rows)
  if (catalogCache.at) {
    groupsCache = { catalogAt: catalogCache.at, groups }
  }
  return groups
}

async function loadShopGroupsLite(container: MedusaContainer) {
  const product = productModuleOf(container)
  const [collections, products] = await Promise.all([
    listCollections(container),
    product.listProducts(
      { status: "published" },
      {
        take: 400,
        select: ["id", "collection_id", "thumbnail"],
      }
    ),
  ])
  return presentShopGroups(collections, products)
}

export async function listShopGroupsCatalog(container: MedusaContainer) {
  const ready = memoryCatalogRows()
  if (groupsCache?.groups.length) {
    if (ready && groupsCache.catalogAt !== catalogCache.at) {
      void storeGroupsFromRows(container, ready)
    }
    return groupsCache.groups
  }
  if (ready) {
    return storeGroupsFromRows(container, ready)
  }
  return loadShopGroupsLite(container)
}

function randomCatalogSkip(count: number, random = Math.random) {
  if (count < 1) return 0
  return Math.min(count - 1, Math.floor(random() * count))
}

export { randomCatalogSkip }

async function loadPublishedProductAt(container: MedusaContainer, skip: number) {
  const product = productModuleOf(container)
  const products = await product.listProducts(
    { status: "published" },
    {
      skip: Math.max(0, skip),
      take: 1,
      select: [...PRODUCT_LIST_SELECT],
    }
  )
  if (!products[0]) return null
  const variants = await product.listProductVariants(
    { product_id: String(products[0].id) },
    { take: 16, select: [...VARIANT_LIST_SELECT] }
  )
  const rows = catalogRowsFromProducts(
    products as ProductListRow[],
    variants as Array<{
      id?: string
      sku?: string | null
      manage_inventory?: boolean | null
      metadata?: Record<string, unknown> | null
      product_id?: string | null
    }>
  )
  const hydrated = await hydrateCatalogInventory(container, rows)
  return hydrated[0] || null
}

export async function getLuckyShopProducts(
  container: MedusaContainer,
  excludeId?: string | null,
  limit = 1
) {
  const size = Math.min(Math.max(Number(limit) || 1, 1), 3)
  if (catalogCache.rows.length) {
    return pickLuckyCatalogRows(catalogCache.rows, size, excludeId).map(
      presentCatalogProduct
    )
  }
  const product = productModuleOf(container)
  const [, count] = await product.listAndCountProducts(
    { status: "published" },
    { skip: 0, take: 1, select: ["id"] }
  )
  const total = Number(count) || 0
  if (total < 1) return []
  const picked: CatalogRow[] = []
  const spare: CatalogRow[] = []
  const seen = new Set<string>()
  if (excludeId) seen.add(excludeId)
  for (let attempt = 0; attempt < size * 6 && picked.length < size; attempt++) {
    const row = await loadPublishedProductAt(
      container,
      randomCatalogSkip(total)
    )
    if (!row || seen.has(row.id)) continue
    seen.add(row.id)
    if (catalogProductInStock(row)) picked.push(row)
    else if (spare.length < size) spare.push(row)
  }
  const rows = picked.slice()
  for (const row of spare) {
    if (rows.length >= size) break
    if (!rows.some((item) => item.id === row.id)) rows.push(row)
  }
  return rows.map(presentCatalogProduct)
}

export async function getLuckyShopProduct(
  container: MedusaContainer,
  excludeId?: string | null
) {
  const [product] = await getLuckyShopProducts(container, excludeId, 1)
  return product || null
}

export async function getHomeShopProducts(
  container: MedusaContainer,
  productLimit = 16,
  recommendationLimit = 3
) {
  const rows = memoryCatalogRows() || (await loadEnoughInStockRows(container, 400))
  queueCatalogRefresh(container)
  const products = pickDiverseCatalogRows(rows, productLimit)
  const recommendations = pickDiverseCatalogRows(
    rows,
    recommendationLimit,
    products.map((row) => row.id)
  )
  return {
    products: products.map(presentCatalogProduct),
    recommendations: recommendations.map(presentCatalogProduct),
  }
}

export async function bumpProductViews(
  container: MedusaContainer,
  productId: string
) {
  const id = String(productId || "").trim()
  if (!id) return false
  const productModule = container.resolve(
    Modules.PRODUCT
  ) as IProductModuleService
  const [product] = await productModule.listProducts(
    { id },
    { take: 1, select: ["id", "metadata"] }
  )
  if (!product?.id) return false
  const metadata = {
    ...((product.metadata || {}) as Record<string, unknown>),
  }
  const current = Number(metadata[SHOP_VIEWS_KEY] || 0)
  metadata[SHOP_VIEWS_KEY] = Number.isFinite(current) ? current + 1 : 1
  await productModule.updateProducts(id, { metadata })
  return true
}
