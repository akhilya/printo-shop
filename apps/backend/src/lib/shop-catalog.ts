import { MedusaContainer } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { updateProductsWorkflow } from "@medusajs/medusa/core-flows"

export const SHOP_VIEWS_KEY = "shop_views"

const CATALOG_PAGE = 100
const CATALOG_CAP = 2000

type CatalogVariant = {
  sku?: string | null
  manage_inventory?: boolean | null
  inventory_quantity?: number | null
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

export function catalogNeedle(value: unknown) {
  return String(value || "").trim().toLowerCase()
}

export function catalogProductInStock(row: CatalogRow) {
  const variants = row.variants || []
  if (!variants.length) return false
  return variants.some((variant) => {
    if (variant.manage_inventory === false) return true
    const qty = Number(variant.inventory_quantity)
    return Number.isFinite(qty) && qty > 0
  })
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

async function listPublishedCatalogRows(container: MedusaContainer) {
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
        "variants.sku",
        "variants.manage_inventory",
        "variants.inventory_quantity",
      ],
      filters: { status: "published" },
      pagination: { skip, take: CATALOG_PAGE },
    })
    const batch = (data ?? []) as CatalogRow[]
    rows.push(...batch)
    if (batch.length < CATALOG_PAGE) break
  }
  return rows
}

export async function listShopCatalogPage(
  container: MedusaContainer,
  input: {
    q?: string | null
    category_id?: string | null
    collection_id?: string | null
    offset?: number
    limit?: number
  }
) {
  const needle = catalogNeedle(input.q)
  const categoryId = String(input.category_id || "").trim()
  const collectionId = String(input.collection_id || "").trim()
  const rows = sortCatalogByAvailability(
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
  return pageCatalogIds(rows, input.offset || 0, input.limit || 20)
}

export async function listShopGroupsCatalog(container: MedusaContainer) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "product_collection",
    fields: ["id", "title", "handle"],
    pagination: { skip: 0, take: 200 },
  })
  const rows = await listPublishedCatalogRows(container)
  const imagesByGroup = new Map<string, string[]>()
  const countByGroup = new Map<string, number>()
  for (const product of rows) {
    const id = String(product.collection_id || "").trim()
    if (!id) continue
    countByGroup.set(id, (countByGroup.get(id) || 0) + 1)
    const src = product.thumbnail ? String(product.thumbnail) : ""
    if (!src) continue
    const list = imagesByGroup.get(id) || []
    if (list.length < 4) list.push(src)
    imagesByGroup.set(id, list)
  }
  return ((data ?? []) as Array<Record<string, unknown>>)
    .map((collection) => {
      const id = String(collection.id || "")
      return {
        id,
        title: String(collection.title || ""),
        path: `/collections/${id}`,
        images: imagesByGroup.get(id) || [],
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
