import { MedusaContainer } from "@medusajs/framework"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { updateProductsWorkflow } from "@medusajs/medusa/core-flows"
import {
  applyShopGroupCoverImages,
  readShopCollectionCover,
  type ShopGroupProductImage,
} from "./shop-collection-cover"

export const SHOP_VIEWS_KEY = "shop_views"

const CATALOG_PAGE = 300
const CATALOG_CAP = 10000
const INVENTORY_PAGE = 1000
const CATALOG_TTL_MS = 90_000

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
  inventory_items?: CatalogInventoryItem[] | null
}

export type CatalogRow = {
  id: string
  title?: string | null
  handle?: string | null
  thumbnail?: string | null
  collection_id?: string | null
  status?: string | null
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

export function invalidateShopCatalogCache() {
  catalogCache = { at: 0, rows: [] }
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

async function loadPublishedCatalogRows(container: MedusaContainer) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const rows: CatalogRow[] = []
  for (let skip = 0; skip < CATALOG_CAP; skip += CATALOG_PAGE) {
    const { data } = await query.graph({
      entity: "product",
      fields: [
        "id",
        "title",
        "handle",
        "thumbnail",
        "status",
        "collection_id",
        "categories.id",
        "variants.id",
        "variants.sku",
        "variants.manage_inventory",
        "variants.inventory_items.inventory_item_id",
        "variants.inventory_items.required_quantity",
      ],
      filters: { status: "published" },
      pagination: { skip, take: CATALOG_PAGE },
    })
    const batch = (data ?? []) as CatalogRow[]
    rows.push(...batch)
    if (batch.length < CATALOG_PAGE) break
  }
  try {
    applyInventoryItemQuantities(rows, await listQtyByInventoryItem(container))
  } catch {
    // Untracked variants stay as manage_inventory / missing qty.
  }
  return rows
}

async function listPublishedCatalogRows(container: MedusaContainer) {
  if (catalogCache.rows.length && Date.now() - catalogCache.at < CATALOG_TTL_MS) {
    return catalogCache.rows
  }
  if (catalogInflight) return catalogInflight
  catalogInflight = loadPublishedCatalogRows(container)
    .then((rows) => {
      catalogCache = { at: Date.now(), rows }
      return rows
    })
    .finally(() => {
      catalogInflight = null
    })
  return catalogInflight
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
  return pageCatalogIds(rows, input.offset || 0, input.limit || 20)
}

export async function listShopGroupsCatalog(container: MedusaContainer) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "product_collection",
    fields: ["id", "title", "handle", "metadata"],
    pagination: { skip: 0, take: 200 },
  })
  const rows = await listPublishedCatalogRows(container)
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
  return ((data ?? []) as Array<Record<string, unknown>>)
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
