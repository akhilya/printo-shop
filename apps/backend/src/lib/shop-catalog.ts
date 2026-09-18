import { MedusaContainer } from "@medusajs/framework"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { updateProductsWorkflow } from "@medusajs/medusa/core-flows"
import {
  applyShopGroupCoverImages,
  readShopCollectionCover,
  type ShopGroupProductImage,
} from "./shop-collection-cover"

export const SHOP_VIEWS_KEY = "shop_views"

const CATALOG_PAGE = 1000
const CATALOG_CAP = 10000
const INVENTORY_PAGE = 2000
const CATALOG_TTL_MS = 60_000
const CATALOG_STALE_MS = 10 * 60_000
const IN_STOCK_PREVIEW_BATCH = 48
const CATALOG_PRODUCT_FIELDS = [
  "id",
  "title",
  "handle",
  "thumbnail",
  "status",
  "collection_id",
  "metadata",
  "categories.id",
  "variants.id",
  "variants.sku",
  "variants.manage_inventory",
  "variants.metadata",
  "variants.inventory_items.inventory_item_id",
  "variants.inventory_items.required_quantity",
]
const CATALOG_META_KEYS = [
  "price",
  "old_price",
  "sale_price",
  "attributes",
  "brand",
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
  return String(value || "").trim().toLowerCase()
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
  if (String(row.title || "").toLowerCase().includes(needle)) return true
  if (String(row.handle || "").toLowerCase().includes(needle)) return true
  for (const variant of row.variants || []) {
    if (String(variant.sku || "").toLowerCase().includes(needle)) return true
  }
  return false
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

export function presentCatalogProduct(row: CatalogRow) {
  const metadata = (row.metadata || {}) as Record<string, unknown>
  const variants = row.variants || []
  const first = variants[0]
  const current =
    catalogMoney(metadata.sale_price) ?? catalogMoney(metadata.price)
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
      metadata: slimCatalogMetadata(variant.metadata),
    })),
  }
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

export function pickLuckyCatalogRow(rows: CatalogRow[], excludeId?: string | null) {
  const available = rows.filter(
    (row) => row.id !== excludeId && catalogProductInStock(row)
  )
  const pool = available.length
    ? available
    : rows.filter((row) => row.id !== excludeId)
  if (!pool.length) return null
  return pool[Math.floor(Math.random() * pool.length)] || null
}

function presentLucky(row: CatalogRow) {
  return {
    id: row.id,
    handle: String(row.handle || ""),
    title: String(row.title || ""),
    thumbnail: row.thumbnail ? String(row.thumbnail) : null,
  }
}

let catalogCache: { at: number; rows: CatalogRow[] } = { at: 0, rows: [] }
let catalogInflight: Promise<CatalogRow[]> | null = null
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
  catalogCache = { at: 0, rows: [] }
  groupsCache = null
}

function refreshCatalogInBackground(container: MedusaContainer) {
  if (catalogInflight) return catalogInflight
  catalogInflight = loadPublishedCatalogRows(container)
    .then((rows) => {
      catalogCache = { at: Date.now(), rows }
      groupsCache = null
      return rows
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

async function listQtyByInventoryItem(container: MedusaContainer) {
  const inventory = container.resolve(Modules.INVENTORY) as {
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
  const qty: Record<string, number> = {}
  for (let skip = 0; skip < CATALOG_CAP; skip += INVENTORY_PAGE) {
    const levels = await inventory.listInventoryLevels(
      {},
      {
        skip,
        take: INVENTORY_PAGE,
        select: ["inventory_item_id", "stocked_quantity", "reserved_quantity"],
      }
    )
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
    if (levels.length < INVENTORY_PAGE) break
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

async function listQtyForInventoryItems(
  container: MedusaContainer,
  itemIds: string[]
) {
  const unique = [...new Set(itemIds.filter(Boolean))]
  if (!unique.length) return {}
  const inventory = container.resolve(Modules.INVENTORY) as {
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
  const levels = await inventory.listInventoryLevels(
    { inventory_item_id: unique },
    {
      take: Math.min(unique.length * 8, CATALOG_CAP),
      select: ["inventory_item_id", "stocked_quantity", "reserved_quantity"],
    }
  )
  const qty: Record<string, number> = {}
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

async function loadEnoughInStockRows(container: MedusaContainer, needed: number) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const inStock: CatalogRow[] = []
  const want = Math.max(1, needed)
  for (let skip = 0; skip < CATALOG_CAP; skip += IN_STOCK_PREVIEW_BATCH) {
    const { data } = await query.graph({
      entity: "product",
      fields: CATALOG_PRODUCT_FIELDS,
      filters: { status: "published" },
      pagination: { skip, take: IN_STOCK_PREVIEW_BATCH },
    })
    const batch = (data ?? []) as CatalogRow[]
    if (!batch.length) break
    const qty = await listQtyForInventoryItems(
      container,
      inventoryItemIdsFromRows(batch)
    ).catch(() => ({}))
    applyInventoryItemQuantities(batch, qty)
    for (const row of batch) {
      if (!catalogProductInStock(row)) continue
      inStock.push(slimCatalogRow(row))
      if (inStock.length >= want) return inStock
    }
    if (batch.length < IN_STOCK_PREVIEW_BATCH) break
  }
  return inStock
}

async function loadPublishedCatalogRows(container: MedusaContainer) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const loadRows = async () => {
    const rows: CatalogRow[] = []
    for (let skip = 0; skip < CATALOG_CAP; skip += CATALOG_PAGE) {
      const { data } = await query.graph({
        entity: "product",
        fields: CATALOG_PRODUCT_FIELDS,
        filters: { status: "published" },
        pagination: { skip, take: CATALOG_PAGE },
      })
      const batch = (data ?? []) as CatalogRow[]
      rows.push(...batch)
      if (batch.length < CATALOG_PAGE) break
    }
    return rows
  }
  const [rows, qty] = await Promise.all([
    loadRows(),
    listQtyByInventoryItem(container).catch(() => ({})),
  ])
  applyInventoryItemQuantities(rows, qty)
  return rows.map(slimCatalogRow)
}

async function listPublishedCatalogRows(container: MedusaContainer) {
  const age = Date.now() - catalogCache.at
  if (catalogCache.rows.length && age < CATALOG_TTL_MS) {
    return catalogCache.rows
  }
  if (catalogCache.rows.length && age < CATALOG_STALE_MS) {
    refreshCatalogInBackground(container)
    return catalogCache.rows
  }
  if (catalogInflight) return catalogInflight
  return refreshCatalogInBackground(container)
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
  const needle = catalogNeedle(input.q)
  const categoryId = String(input.category_id || "").trim()
  const collectionId = String(input.collection_id || "").trim()
  const offset = input.offset || 0
  const limit = input.limit || 20
  if (canPreviewInStockPage(input) && !catalogCache.rows.length) {
    refreshCatalogInBackground(container)
    const rows = await loadEnoughInStockRows(container, offset + limit)
    return pageCatalogProducts(rows, offset, limit)
  }
  let rows = sortCatalogByAvailability(
    (await listPublishedCatalogRows(container)).filter((row) => {
      if (!productMatchesCatalogQuery(row, needle)) return false
      if (collectionId && String(row.collection_id || "") !== collectionId) {
        return false
      }
      if (categoryId) {
        const categories = row.categories || []
        if (!categories.some((item) => String(item.id || "") === categoryId)) {
          return false
        }
      }
      return true
    })
  )
  if (input.in_stock) {
    rows = rows.filter(catalogProductInStock)
  }
  return pageCatalogProducts(rows, offset, limit)
}

export async function listShopGroupsCatalog(container: MedusaContainer) {
  const rows = await listPublishedCatalogRows(container)
  if (groupsCache && groupsCache.catalogAt === catalogCache.at) {
    return groupsCache.groups
  }
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "product_collection",
    fields: ["id", "title", "handle", "metadata"],
    pagination: { skip: 0, take: 200 },
  })
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
  const groups = ((data ?? []) as Array<Record<string, unknown>>)
    .map((collection) => {
      const id = String(collection.id || "")
      return {
        id,
        title: String(collection.title || ""),
        path: `/collections/${id}`,
        images: applyShopGroupCoverImages(
          imagesByGroup.get(id) || [],
          readShopCollectionCover(collection.metadata)
        ),
        count: countByGroup.get(id) || 0,
      }
    })
    .filter((group) => group.id && group.count > 0)
  if (catalogCache.at) {
    groupsCache = { catalogAt: catalogCache.at, groups }
  }
  return groups
}

export async function getLuckyShopProduct(
  container: MedusaContainer,
  excludeId?: string | null
) {
  const row = pickLuckyCatalogRow(
    await listPublishedCatalogRows(container),
    excludeId
  )
  return row ? presentLucky(row) : null
}

export async function bumpProductViews(
  container: MedusaContainer,
  productId: string
) {
  const id = String(productId || "").trim()
  if (!id) return false
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "product",
    fields: ["id", "metadata"],
    filters: { id },
  })
  const product = (data?.[0] || null) as Record<string, unknown> | null
  if (!product?.id) return false
  const metadata = {
    ...((product.metadata || {}) as Record<string, unknown>),
  }
  const current = Number(metadata[SHOP_VIEWS_KEY] || 0)
  metadata[SHOP_VIEWS_KEY] = Number.isFinite(current) ? current + 1 : 1
  await updateProductsWorkflow(container).run({
    input: {
      selector: { id },
      update: { metadata },
    },
  })
  return true
}
