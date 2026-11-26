import { MedusaContainer } from "@medusajs/framework"
import { slimDelegatFieldsJson } from "../shop-store-category"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import {
  batchProductVariantsWorkflow,
  createInventoryLevelsWorkflow,
  createLinksWorkflow,
  createProductCategoriesWorkflow,
  createProductsWorkflow,
  createProductVariantsWorkflow,
  updateInventoryLevelsWorkflow,
  updateProductCategoriesWorkflow,
  updateProductsWorkflow,
  updateProductVariantsWorkflow,
} from "@medusajs/medusa/core-flows"
import { ingestDepsFromContainer } from "./ingest-images-io"
import { ingestImageUrls, ingestManyUrls } from "./ingest-images"
import { resolveCollectionIdForProduct } from "./groups"
import { mapProduct, readGroupRef, slugify } from "./map-product"
import type {
  DelegatField,
  DelegatProductPayload,
} from "./types"

const API_VERSION = "1.0.0"

type GraphRow = Record<string, any>

type StoreContext = {
  currency: string
  salesChannelId?: string
  shippingProfileId?: string
  locationId?: string
  storeName: string
}

let storeContextCache: { at: number; value: StoreContext } | null = null
const STORE_CONTEXT_TTL_MS = 30_000

async function getStoreContext(container: MedusaContainer): Promise<StoreContext> {
  if (
    storeContextCache &&
    Date.now() - storeContextCache.at < STORE_CONTEXT_TTL_MS
  ) {
    return storeContextCache.value
  }
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data: stores } = await query.graph({
    entity: "store",
    fields: [
      "name",
      "default_sales_channel_id",
      "supported_currencies.*",
    ],
  })
  const store = stores[0] as GraphRow | undefined
  const currencies = (store?.supported_currencies ?? []) as GraphRow[]
  const currency =
    currencies.find((c) => c?.is_default)?.currency_code ??
    currencies[0]?.currency_code ??
    "rub"

  const { data: locations } = await query.graph({
    entity: "stock_location",
    fields: ["id", "name"],
  })
  const { data: profiles } = await query.graph({
    entity: "shipping_profile",
    fields: ["id"],
  })

  const value: StoreContext = {
    currency: String(currency).toLowerCase(),
    salesChannelId: store?.default_sales_channel_id ?? undefined,
    shippingProfileId: profiles[0]?.id ?? undefined,
    locationId: locations[0]?.id ?? undefined,
    storeName: store?.name ?? "Shop",
  }
  storeContextCache = { at: Date.now(), value }
  return value
}

export async function getHealth(container: MedusaContainer) {
  const ctx = await getStoreContext(container)
  return {
    success: true,
    store_name: ctx.storeName,
    medusa_version: "2.20.1",
    api_version: API_VERSION,
    capabilities: [
      "products.upsert",
      "products.bulk",
      "products.batch_read",
      "categories.upsert",
      "prices.bulk",
      "stocks.bulk",
      "groups.upsert",
      "orders.list",
      "orders.status",
      "orders.label",
    ],
  }
}

export function defaultFields(): DelegatField[] {
  return [
    { key: "sku", name: "SKU", type: "string", is_required: true, group: "Basic", sort_order: 1 },
    { key: "name", name: "Name", type: "string", is_required: true, group: "Basic", sort_order: 2 },
    { key: "description", name: "Description", type: "string", group: "Basic", sort_order: 3 },
    { key: "quantity", name: "Stock quantity", type: "integer", group: "Inventory", sort_order: 4 },
    { key: "barcode", name: "Barcode", type: "string", group: "Basic", sort_order: 5 },
    { key: "brand", name: "Brand", type: "string", group: "Basic", sort_order: 6 },
    { key: "images", name: "Images", type: "multiselect", group: "Media", sort_order: 7 },
  ]
}

export async function listCategories(
  container: MedusaContainer,
  parentId?: string,
  search?: string
) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const filters: Record<string, unknown> = {}
  if (parentId) {
    filters.parent_category_id = parentId
  }

  const { data } = await query.graph({
    entity: "product_category",
    fields: [
      "id",
      "name",
      "parent_category_id",
      "parent_category.name",
      "category_children.id",
    ],
    filters: Object.keys(filters).length ? filters : undefined,
  })

  const needle = search?.trim().toLowerCase()
  const categories = (data ?? [])
    .filter((c: { name?: string }) =>
      needle ? (c.name ?? "").toLowerCase().includes(needle) : true
    )
    .map((c: {
      id: string
      name: string
      parent_category_id?: string | null
      parent_category?: { name?: string } | null
      category_children?: { id: string }[]
    }) => ({
      id: c.id,
      name: c.name,
      parent_id: c.parent_category_id ?? null,
      parent_name: c.parent_category?.name ?? null,
      full_path: c.parent_category?.name
        ? `${c.parent_category.name} / ${c.name}`
        : c.name,
      has_children: (c.category_children?.length ?? 0) > 0,
      children_count: c.category_children?.length ?? 0,
    }))

  return { success: true, categories }
}

export async function upsertCategory(
  container: MedusaContainer,
  body: {
    name: string
    description?: string | null
    parent_id?: string | null
    sort_order?: number
    category_id?: string | null
    fields?: DelegatField[]
  }
) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const metadata = body.fields?.length
    ? { delegat_fields: slimDelegatFieldsJson(body.fields) }
    : undefined

  let categoryId = body.category_id?.trim() || ""

  if (!categoryId) {
    const { data } = await query.graph({
      entity: "product_category",
      fields: ["id", "name", "parent_category_id"],
    })
    const match = (data ?? []).find(
      (c: { name: string; parent_category_id?: string | null }) =>
        c.name === body.name &&
        (c.parent_category_id || "") === (body.parent_id || "")
    )
    categoryId = match?.id ?? ""
  }

  if (categoryId) {
    await updateProductCategoriesWorkflow(container).run({
      input: {
        selector: { id: categoryId },
        update: {
          name: body.name,
          description: body.description ?? undefined,
          parent_category_id: body.parent_id || null,
          rank: body.sort_order ?? 0,
          metadata,
        },
      },
    })
    return { success: true, category_id: categoryId, name: body.name }
  }

  const { result } = await createProductCategoriesWorkflow(container).run({
    input: {
      product_categories: [
        {
          name: body.name,
          description: body.description ?? undefined,
          parent_category_id: body.parent_id || undefined,
          rank: body.sort_order ?? 0,
          is_active: true,
          metadata,
        },
      ],
    },
  })

  const created = result[0]
  return { success: true, category_id: created.id, name: created.name ?? body.name }
}

export function formatError(error: unknown): string {
  if (!error) return "Unknown error"
  if (typeof error === "string") return error
  if (error instanceof Error) return error.message || error.name
  if (typeof error === "object") {
    const rec = error as Record<string, unknown>
    if (typeof rec.message === "string" && rec.message.trim()) return rec.message
    try {
      return JSON.stringify(error)
    } catch {
      return "Unknown error"
    }
  }
  return String(error)
}

function imageKeysFingerprint(keys?: string[] | null) {
  if (!keys?.length) return ""
  return JSON.stringify(keys)
}

async function loadProductImageState(
  container: MedusaContainer,
  productIds: string[]
) {
  const state = new Map<string, { urls: string[]; imageKeys: string }>()
  if (!productIds.length) return state
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "product",
    fields: ["id", "images.url", "metadata"],
    filters: { id: productIds },
  })
  for (const row of (data ?? []) as GraphRow[]) {
    state.set(String(row.id), {
      urls: (row.images ?? [])
        .map((img: GraphRow) => String(img?.url || ""))
        .filter(Boolean),
      imageKeys: String(row.metadata?.image_keys || ""),
    })
  }
  return state
}

function shouldReuseImages(
  prev: { urls: string[]; imageKeys: string } | undefined,
  incomingKeys: string
) {
  if (!prev?.urls.length) return false
  if (incomingKeys && prev.imageKeys && incomingKeys !== prev.imageKeys) {
    return false
  }
  return true
}

async function findProductId(
  container: MedusaContainer,
  payload: DelegatProductPayload
): Promise<string | null> {
  const productModule = productModuleOf(container)

  if (payload.product_id) {
    const found = await productModule.listProducts(
      { id: payload.product_id },
      { take: 1, select: ["id"] }
    )
    if (found[0]?.id) return String(found[0].id)
  }

  if (payload.sku) {
    const variants = await productModule.listProductVariants(
      { sku: payload.sku },
      { take: 1, select: ["id", "product_id"] }
    )
    if (variants[0]?.product_id) return String(variants[0].product_id)
  }

  if (payload.delegat_product_id) {
    const found = await productModule.listProducts(
      {},
      { take: 8000, select: ["id", "metadata"] }
    )
    const match = found.find(
      (p) => p?.metadata?.delegat_product_id === payload.delegat_product_id
    )
    if (match?.id) return String(match.id)
  }

  return null
}

async function ensureVariantPriceLinks(
  container: MedusaContainer,
  variantIds: string[]
) {
  const unique = [...new Set(variantIds.filter(Boolean))]
  if (!unique.length) return
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
      ) => Promise<Array<{ variant_id: string; price_set_id: string }>>
    }
  }
  const linkService = remoteLink.getLinkModule(
    Modules.PRODUCT,
    "variant_id",
    Modules.PRICING,
    "price_set_id"
  )
  const existing = await linkService.list(
    { variant_id: unique },
    { select: ["variant_id", "price_set_id"] }
  )
  const have = new Set(existing.map((row) => row.variant_id))
  const missing = unique.filter((id) => !have.has(id))
  if (!missing.length) return

  const pricing = container.resolve(Modules.PRICING) as {
    createPriceSets: (
      data: Array<{ prices?: unknown[] }>
    ) => Promise<Array<{ id: string }>>
  }
  const priceSets = await pricing.createPriceSets(
    missing.map(() => ({ prices: [] }))
  )
  await createLinksWorkflow(container).run({
    input: missing.map((variantId, i) => ({
      [Modules.PRODUCT]: { variant_id: variantId },
      [Modules.PRICING]: { price_set_id: priceSets[i].id },
    })),
  })
}

export async function upsertProduct(
  container: MedusaContainer,
  payload: DelegatProductPayload
) {
  if (!payload?.name?.trim()) {
    return { success: false, error: "Product name is required" }
  }

  const ctx = await getStoreContext(container)
  const mapped = mapProduct(payload)
  const existingId = await findProductId(container, payload)
  const collectionId = await resolveCollectionIdForProduct(container, payload)

  const options = Object.entries(mapped.optionValues).map(([title, values]) => ({
    title,
    values,
  }))
  if (options.length === 0) {
    options.push({ title: "Title", values: ["Default"] })
  }

  const variantInputs = mapped.variants.map((variant) => ({
    title: variant.title,
    sku: variant.sku,
    barcode: variant.barcode,
    options: variant.options,
    manage_inventory: true,
    allow_backorder: false,
    metadata: {
      delegat_variant_id: variant.delegatVariantId,
      ...(variant.old_price != null ? { old_price: String(variant.old_price) } : {}),
    },
    prices: [{ amount: variant.amount, currency_code: ctx.currency }],
  }))

  let hostedUrls: string[] = []
  let skipImageUpdate = false
  if (existingId) {
    const prev = (await loadProductImageState(container, [existingId])).get(
      existingId
    )
    if (shouldReuseImages(prev, imageKeysFingerprint(payload.image_keys))) {
      hostedUrls = prev!.urls
      skipImageUpdate = true
    }
  }
  if (!skipImageUpdate) {
    hostedUrls = await ingestImageUrls(
      mapped.imageUrls,
      ingestDepsFromContainer(container)
    )
  }
  const images = hostedUrls.map((url) => ({ url }))

  let productId = existingId
  if (!productId) {
    const { result } = await createProductsWorkflow(container).run({
      input: {
        products: [
          {
            title: mapped.title,
            handle: mapped.handle,
            description: mapped.description,
            status: mapped.status,
            metadata: mapped.metadata,
            category_ids: mapped.categoryIds,
            collection_id: collectionId || undefined,
            images,
            options,
            variants: variantInputs,
            shipping_profile_id: ctx.shippingProfileId,
            sales_channels: ctx.salesChannelId
              ? [{ id: ctx.salesChannelId }]
              : undefined,
          },
        ],
      },
    })
    productId = result[0].id
  } else {
    await updateProductsWorkflow(container).run({
      input: {
        selector: { id: productId },
        update: {
          title: mapped.title,
          description: mapped.description,
          status: mapped.status,
          metadata: mapped.metadata,
          category_ids: mapped.categoryIds,
          ...(collectionId ? { collection_id: collectionId } : {}),
          ...(skipImageUpdate ? {} : { images }),
        },
      },
    })
    await syncVariants(container, productId, variantInputs, ctx.currency)
  }

  const variantIds = await applyInventory(
    container,
    productId!,
    mapped.variants,
    ctx.locationId
  )

  return {
    success: true,
    product_id: productId,
    variant_ids: variantIds,
  }
}

async function syncVariants(
  container: MedusaContainer,
  productId: string,
  variantInputs: {
    title: string
    sku?: string
    barcode?: string
    options: Record<string, string>
    metadata: Record<string, string>
    prices: { amount: number; currency_code: string }[]
  }[],
  _currency: string
) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data: existing } = await query.graph({
    entity: "product_variant",
    fields: ["id", "sku", "metadata"],
    filters: { product_id: productId },
  })

  const byDelegat = new Map<string, string>()
  const bySku = new Map<string, string>()
  for (const variant of (existing ?? []) as GraphRow[]) {
    const delegatId = variant.metadata?.delegat_variant_id
    if (typeof delegatId === "string" && delegatId) {
      byDelegat.set(delegatId, variant.id)
    }
    if (typeof variant.sku === "string" && variant.sku) {
      bySku.set(variant.sku, variant.id)
    }
  }

  const missingSkus = variantInputs
    .map((input) => input.sku)
    .filter((sku): sku is string => typeof sku === "string" && sku.length > 0)
    .filter((sku) => !bySku.has(sku))
  if (missingSkus.length) {
    const extras = await productModuleOf(container).listProductVariants(
      { sku: missingSkus },
      { take: missingSkus.length, select: ["id", "sku"] }
    )
    for (const row of extras) {
      if (row.sku && row.id) bySku.set(String(row.sku), String(row.id))
    }
  }

  const toCreate: Array<(typeof variantInputs)[number] & { product_id: string }> = []
  const toUpdate: Array<(typeof variantInputs)[number] & { id: string }> = []
  for (const input of variantInputs) {
    const id =
      byDelegat.get(input.metadata.delegat_variant_id) ||
      (input.sku ? bySku.get(input.sku) : undefined)
    if (id) toUpdate.push({ ...input, id })
    else toCreate.push({ ...input, product_id: productId })
  }

  await ensureVariantPriceLinks(
    container,
    toUpdate.map((input) => input.id)
  )
  for (const input of toUpdate) {
    await updateProductVariantsWorkflow(container).run({
      input: {
        selector: { id: input.id },
        update: {
          title: input.title,
          sku: input.sku,
          barcode: input.barcode,
          metadata: input.metadata,
          prices: input.prices,
        },
      },
    })
  }

  if (toCreate.length > 0) {
    await createProductVariantsWorkflow(container).run({
      input: {
        product_variants: toCreate,
      },
    })
  }
}

function inventoryModuleOf(container: MedusaContainer) {
  return container.resolve(Modules.INVENTORY) as {
    listInventoryLevels: (
      filters: Record<string, unknown>,
      config?: Record<string, unknown>
    ) => Promise<
      Array<{ id: string; inventory_item_id: string; location_id: string }>
    >
  }
}

function inventoryItemIdOf(variant: GraphRow): string | null {
  const link = variant.inventory_items?.[0] as GraphRow | undefined
  if (!link) return null
  const id =
    link.inventory_item_id || link.inventory_item?.id || link.inventory?.id
  return id ? String(id) : null
}

function matchMappedVariant(
  rows: GraphRow[],
  mapped: ReturnType<typeof mapProduct>["variants"][number]
) {
  return rows.find(
    (row) =>
      row.id === mapped.delegatVariantId ||
      row.metadata?.delegat_variant_id === mapped.delegatVariantId ||
      (mapped.sku && row.sku === mapped.sku)
  )
}

async function syncInventoryLevels(
  container: MedusaContainer,
  rows: Array<{
    inventoryItemId: string
    locationId: string
    quantity: number
  }>
) {
  if (!rows.length) return
  const unique = new Map<
    string,
    { inventoryItemId: string; locationId: string; quantity: number }
  >()
  for (const row of rows) {
    unique.set(`${row.inventoryItemId}:${row.locationId}`, row)
  }
  const list = [...unique.values()]
  const inventory = inventoryModuleOf(container)
  const existing = await inventory.listInventoryLevels(
    {
      inventory_item_id: list.map((row) => row.inventoryItemId),
      location_id: [...new Set(list.map((row) => row.locationId))],
    },
    { take: list.length, select: ["id", "inventory_item_id", "location_id"] }
  )
  const have = new Map(
    existing.map((level) => [
      `${level.inventory_item_id}:${level.location_id}`,
      level.id,
    ])
  )
  const updates: Array<{
    id: string
    inventory_item_id: string
    location_id: string
    stocked_quantity: number
  }> = []
  const creates: Array<{
    inventory_item_id: string
    location_id: string
    stocked_quantity: number
  }> = []
  for (const row of list) {
    const id = have.get(`${row.inventoryItemId}:${row.locationId}`)
    if (id) {
      updates.push({
        id,
        inventory_item_id: row.inventoryItemId,
        location_id: row.locationId,
        stocked_quantity: row.quantity,
      })
    } else {
      creates.push({
        inventory_item_id: row.inventoryItemId,
        location_id: row.locationId,
        stocked_quantity: row.quantity,
      })
    }
  }
  if (updates.length) {
    await updateInventoryLevelsWorkflow(container).run({
      input: { updates },
    })
  }
  if (!creates.length) return
  try {
    await createInventoryLevelsWorkflow(container).run({
      input: { inventory_levels: creates },
    })
  } catch (error) {
    if (!/already exists/i.test(formatError(error))) throw error
    const again = await inventory.listInventoryLevels(
      {
        inventory_item_id: creates.map((row) => row.inventory_item_id),
        location_id: [...new Set(creates.map((row) => row.location_id))],
      },
      { take: creates.length, select: ["id", "inventory_item_id", "location_id"] }
    )
    const byKey = new Map(
      again.map((level) => [
        `${level.inventory_item_id}:${level.location_id}`,
        level.id,
      ])
    )
    const retry = creates.flatMap((row) => {
      const id = byKey.get(`${row.inventory_item_id}:${row.location_id}`)
      return id
        ? [
            {
              id,
              inventory_item_id: row.inventory_item_id,
              location_id: row.location_id,
              stocked_quantity: row.stocked_quantity,
            },
          ]
        : []
    })
    if (retry.length) {
      await updateInventoryLevelsWorkflow(container).run({
        input: { updates: retry },
      })
    }
  }
}

async function applyInventory(
  container: MedusaContainer,
  productId: string,
  variants: ReturnType<typeof mapProduct>["variants"],
  locationId?: string
) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data: existing } = await query.graph({
    entity: "product_variant",
    fields: ["id", "sku", "metadata", "inventory_items.inventory_item_id"],
    filters: { product_id: productId },
  })

  const rows = (existing ?? []) as GraphRow[]
  const variantIds: Record<string, string> = {}
  const stock: Array<{
    inventoryItemId: string
    locationId: string
    quantity: number
  }> = []

  for (const mapped of variants) {
    const variant = matchMappedVariant(rows, mapped)
    if (!variant) continue
    variantIds[mapped.delegatVariantId] = variant.id
    if (!locationId) continue
    const inventoryItemId = inventoryItemIdOf(variant)
    if (!inventoryItemId) continue
    stock.push({
      inventoryItemId,
      locationId,
      quantity: mapped.quantity,
    })
  }
  await syncInventoryLevels(container, stock)
  return variantIds
}

type BulkItemResult = {
  index: number
  success: boolean
  product_id?: string
  error?: string
  local_product_id?: number
  variant_ids?: Record<string, string>
}

function productModuleOf(container: MedusaContainer) {
  return container.resolve(Modules.PRODUCT) as {
    listProducts: (
      filters: Record<string, unknown>,
      config?: Record<string, unknown>
    ) => Promise<GraphRow[]>
    listProductVariants: (
      filters: Record<string, unknown>,
      config?: Record<string, unknown>
    ) => Promise<GraphRow[]>
    restoreProducts: (ids: string[]) => Promise<unknown>
  }
}

function localProductIdOf(payload: DelegatProductPayload) {
  const raw = payload.raw_fields?.local_product_id ?? payload.delegat_product_id
  const n = Number(raw)
  return Number.isFinite(n) ? n : undefined
}

async function indexExistingProducts(
  container: MedusaContainer,
  payloads: DelegatProductPayload[]
) {
  const productModule = productModuleOf(container)
  const ids = [
    ...new Set(payloads.map((p) => p.product_id).filter(Boolean)),
  ] as string[]
  const skus = [...new Set(payloads.map((p) => p.sku).filter(Boolean))] as string[]
  const byId = new Map<string, GraphRow>()
  const productIdBySku = new Map<string, string>()
  const byDelegat = new Map<string, GraphRow>()

  if (ids.length) {
    const found = await productModule.listProducts(
      { id: ids },
      { take: ids.length, select: ["id", "metadata"] }
    )
    for (const row of found) byId.set(String(row.id), row)
  }

  if (skus.length) {
    const variants = await productModule.listProductVariants(
      { sku: skus },
      { take: skus.length, select: ["sku", "product_id"] }
    )
    const productIds = [
      ...new Set(variants.map((v) => v.product_id).filter(Boolean).map(String)),
    ]
    if (productIds.length) {
      const products = await productModule.listProducts(
        { id: productIds },
        { take: productIds.length, select: ["id", "metadata"] }
      )
      for (const row of products) byId.set(String(row.id), row)
    }
    for (const variant of variants) {
      if (variant.sku && variant.product_id) {
        productIdBySku.set(String(variant.sku), String(variant.product_id))
      }
    }
  }

  const needDelegat = payloads.some(
    (p) => p.delegat_product_id && !byId.has(p.product_id || "")
  )
  if (needDelegat) {
    const found = await productModule.listProducts(
      {},
      { take: 8000, select: ["id", "metadata"] }
    )
    for (const row of found) {
      const delegatId = row?.metadata?.delegat_product_id
      if (delegatId) byDelegat.set(String(delegatId), row)
    }
  }

  return payloads.map((payload) => {
    if (payload.product_id && byId.has(payload.product_id)) {
      return byId.get(payload.product_id)!
    }
    if (payload.sku && productIdBySku.has(payload.sku)) {
      const id = productIdBySku.get(payload.sku)!
      return byId.get(id) ?? { id }
    }
    if (payload.delegat_product_id && byDelegat.has(payload.delegat_product_id)) {
      return byDelegat.get(payload.delegat_product_id)!
    }
    return null
  })
}

function variantInputsOf(
  mapped: ReturnType<typeof mapProduct>,
  currency: string
) {
  return mapped.variants.map((variant) => ({
    title: variant.title,
    sku: variant.sku,
    barcode: variant.barcode,
    options: variant.options,
    manage_inventory: true,
    allow_backorder: false,
    metadata: {
      delegat_variant_id: variant.delegatVariantId,
      ...(variant.old_price != null ? { old_price: String(variant.old_price) } : {}),
    },
    prices: [{ amount: variant.amount, currency_code: currency }],
  }))
}

function optionInputsOf(mapped: ReturnType<typeof mapProduct>) {
  const options = Object.entries(mapped.optionValues).map(([title, values]) => ({
    title,
    values,
  }))
  return options.length ? options : [{ title: "Title", values: ["Default"] }]
}

async function applyInventoryBulk(
  container: MedusaContainer,
  items: {
    productId: string
    variants: ReturnType<typeof mapProduct>["variants"]
  }[],
  locationId?: string
) {
  const variantIdsByProduct = new Map<string, Record<string, string>>()
  if (!items.length) return variantIdsByProduct

  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "product_variant",
    fields: ["id", "sku", "product_id", "metadata", "inventory_items.inventory_item_id"],
    filters: { product_id: items.map((item) => item.productId) },
  })

  const rowsByProduct = new Map<string, GraphRow[]>()
  for (const row of (data ?? []) as GraphRow[]) {
    const productId = String(row.product_id)
    const list = rowsByProduct.get(productId) ?? []
    list.push(row)
    rowsByProduct.set(productId, list)
  }

  const stock: Array<{
    inventoryItemId: string
    locationId: string
    quantity: number
  }> = []

  for (const item of items) {
    const rows = rowsByProduct.get(item.productId) ?? []
    const ids: Record<string, string> = {}
    for (const mapped of item.variants) {
      const variant = matchMappedVariant(rows, mapped)
      if (!variant) continue
      ids[mapped.delegatVariantId] = variant.id
      if (!locationId) continue
      const inventoryItemId = inventoryItemIdOf(variant)
      if (!inventoryItemId) continue
      stock.push({
        inventoryItemId,
        locationId,
        quantity: mapped.quantity,
      })
    }
    variantIdsByProduct.set(item.productId, ids)
  }

  await syncInventoryLevels(container, stock)
  return variantIdsByProduct
}

async function syncVariantsBulk(
  container: MedusaContainer,
  items: {
    productId: string
    variants: ReturnType<typeof variantInputsOf>
  }[]
) {
  if (!items.length) return
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "product_variant",
    fields: ["id", "sku", "product_id", "metadata"],
    filters: { product_id: items.map((item) => item.productId) },
  })
  const rows = (data ?? []) as GraphRow[]
  const update: Array<Record<string, unknown>> = []
  const create: Array<Record<string, unknown>> = []

  for (const item of items) {
    const existing = rows.filter((row) => row.product_id === item.productId)
    const byDelegat = new Map<string, string>()
    const bySku = new Map<string, string>()
    for (const row of existing) {
      const delegatId = row.metadata?.delegat_variant_id
      if (typeof delegatId === "string" && delegatId) byDelegat.set(delegatId, row.id)
      if (typeof row.sku === "string" && row.sku) bySku.set(row.sku, row.id)
    }
    for (const input of item.variants) {
      const id =
        byDelegat.get(input.metadata.delegat_variant_id) ||
        (input.sku ? bySku.get(input.sku) : undefined)
      if (id) {
        update.push({
          id,
          title: input.title,
          sku: input.sku,
          barcode: input.barcode,
          metadata: input.metadata,
          prices: input.prices,
        })
      } else {
        create.push({ ...input, product_id: item.productId })
      }
    }
  }

  const createSkus = create
    .map((row) => row.sku)
    .filter((sku): sku is string => typeof sku === "string" && Boolean(sku))
  if (createSkus.length) {
    const extras = await productModuleOf(container).listProductVariants(
      { sku: createSkus },
      { take: createSkus.length, select: ["id", "sku"] }
    )
    const liveSku = new Map(
      extras.map((row) => [String(row.sku), String(row.id)])
    )
    const stillCreate: Array<Record<string, unknown>> = []
    for (const row of create) {
      const sku = typeof row.sku === "string" ? row.sku : ""
      const existingId = sku ? liveSku.get(sku) : undefined
      if (existingId) {
        update.push({
          id: existingId,
          title: row.title,
          sku: row.sku,
          barcode: row.barcode,
          metadata: row.metadata,
          prices: row.prices,
        })
      } else {
        stillCreate.push(row)
      }
    }
    create.length = 0
    create.push(...stillCreate)
  }

  await ensureVariantPriceLinks(
    container,
    update.map((row) => String(row.id))
  )

  if (update.length || create.length) {
    await batchProductVariantsWorkflow(container).run({
      input: {
        update: update as never,
        create: create as never,
      },
    })
  }
}

export async function upsertProductsBulk(
  container: MedusaContainer,
  products: DelegatProductPayload[]
) {
  const results: BulkItemResult[] = products.map((payload, index) => ({
    index,
    success: false,
    local_product_id: localProductIdOf(payload),
  }))

  const valid: number[] = []
  for (let index = 0; index < products.length; index++) {
    if (!products[index]?.name?.trim()) {
      results[index].error = "Product name is required"
      continue
    }
    valid.push(index)
  }
  if (!valid.length) {
    return { success: false, results }
  }

  const ctx = await getStoreContext(container)
  const payloads = valid.map((index) => products[index])
  const mappedList = payloads.map((payload) => mapProduct(payload))
  const existing = await indexExistingProducts(container, payloads)

  const collectionCache = new Map<string, string | null>()
  const collectionIds: Array<string | null> = []
  for (const payload of payloads) {
    const group = readGroupRef(payload)
    const key = `${group.groupId || ""}:${group.groupName || ""}`
    if (!collectionCache.has(key)) {
      collectionCache.set(
        key,
        await resolveCollectionIdForProduct(container, payload)
      )
    }
    collectionIds.push(collectionCache.get(key) ?? null)
  }

  const createJobs: number[] = []
  const updateJobs: number[] = []
  for (let i = 0; i < valid.length; i++) {
    if (existing[i]?.id) updateJobs.push(i)
    else createJobs.push(i)
  }

  const prevImages = await loadProductImageState(
    container,
    updateJobs.map((job) => String(existing[job]!.id))
  )
  const reuseImages = new Set<number>()
  const urlsToIngest: string[] = []
  for (const job of createJobs) {
    urlsToIngest.push(...mappedList[job].imageUrls)
  }
  for (const job of updateJobs) {
    const id = String(existing[job]!.id)
    const prev = prevImages.get(id)
    const incoming = imageKeysFingerprint(payloads[job].image_keys)
    if (shouldReuseImages(prev, incoming)) {
      reuseImages.add(job)
    } else {
      urlsToIngest.push(...mappedList[job].imageUrls)
    }
  }

  const deps = ingestDepsFromContainer(container)
  const hostedMap = await ingestManyUrls(urlsToIngest, deps)
  const imageLists = mappedList.map((mapped, job) => {
    if (reuseImages.has(job)) {
      const id = String(existing[job]!.id)
      return (prevImages.get(id)?.urls ?? []).map((url) => ({ url }))
    }
    return mapped.imageUrls
      .map((url) => hostedMap.get(url))
      .filter((url): url is string => Boolean(url))
      .map((url) => ({ url }))
  })

  const usedHandles = new Set<string>()

  const createdByJob = new Map<number, string>()

  if (createJobs.length) {
    const createInput = createJobs.map((job) => {
      const mapped = mappedList[job]
      let handle = mapped.handle
      let n = 2
      while (usedHandles.has(handle)) {
        handle = slugify(`${mapped.handle}-${mapped.sku || n++}`).slice(0, 80) || handle
      }
      usedHandles.add(handle)
      return {
        title: mapped.title,
        handle,
        description: mapped.description,
        status: mapped.status,
        metadata: mapped.metadata,
        category_ids: mapped.categoryIds,
        collection_id: collectionIds[job] || undefined,
        images: imageLists[job],
        options: optionInputsOf(mapped),
        variants: variantInputsOf(mapped, ctx.currency),
        shipping_profile_id: ctx.shippingProfileId,
        sales_channels: ctx.salesChannelId ? [{ id: ctx.salesChannelId }] : undefined,
      }
    })
    try {
      const { result } = await createProductsWorkflow(container).run({
        input: { products: createInput },
      })
      createJobs.forEach((job, offset) => {
        const id = result[offset]?.id
        if (id) createdByJob.set(job, id)
      })
    } catch (error) {
      for (const job of createJobs) {
        try {
          const one = await upsertProduct(container, payloads[job])
          if (one.success && one.product_id) createdByJob.set(job, one.product_id)
          else results[valid[job]].error = one.error || formatError(error)
        } catch (inner) {
          results[valid[job]].error = formatError(inner)
        }
      }
    }
  }

  if (updateJobs.length) {
    const updateIds = updateJobs.map((job) => String(existing[job]!.id))
    const existingImages = new Map<string, string[]>()
    if (updateIds.length) {
      const query = container.resolve(ContainerRegistrationKeys.QUERY)
      const { data } = await query.graph({
        entity: "product",
        fields: ["id", "images.url"],
        filters: { id: updateIds },
      })
      for (const row of (data ?? []) as GraphRow[]) {
        existingImages.set(
          String(row.id),
          (row.images ?? [])
            .map((img: GraphRow) => String(img?.url || ""))
            .filter(Boolean)
        )
      }
    }
    const updateInput = updateJobs.map((job) => {
      const id = String(existing[job]!.id)
      const nextImages = imageLists[job]
      const prev = existingImages.get(id) ?? []
      const same =
        prev.length === nextImages.length &&
        prev.every((url, i) => url === nextImages[i]?.url)
      return {
        id,
        title: mappedList[job].title,
        description: mappedList[job].description,
        status: mappedList[job].status,
        metadata: mappedList[job].metadata,
        category_ids: mappedList[job].categoryIds,
        collection_id: collectionIds[job] || undefined,
        ...(reuseImages.has(job) || same ? {} : { images: nextImages }),
      }
    })
    try {
      await updateProductsWorkflow(container).run({
        input: { products: updateInput },
      })
      await syncVariantsBulk(
        container,
        updateJobs.map((job) => ({
          productId: String(existing[job]!.id),
          variants: variantInputsOf(mappedList[job], ctx.currency),
        }))
      )
    } catch (error) {
      for (const job of updateJobs) {
        try {
          const one = await upsertProduct(container, payloads[job])
          if (one.success && one.product_id) createdByJob.set(job, one.product_id)
          else results[valid[job]].error = one.error || formatError(error)
        } catch (inner) {
          results[valid[job]].error = formatError(inner)
        }
      }
    }
  }

  const finished: { productId: string; job: number }[] = []
  for (let job = 0; job < valid.length; job++) {
    const productId = existing[job]?.id
      ? String(existing[job]!.id)
      : createdByJob.get(job)
    if (results[valid[job]].error) continue
    if (!productId) {
      results[valid[job]].error = "Product upsert failed"
      continue
    }
    finished.push({ productId, job })
  }

  let inventory = new Map<string, Record<string, string>>()
  try {
    inventory = await applyInventoryBulk(
      container,
      finished.map((item) => ({
        productId: item.productId,
        variants: mappedList[item.job].variants,
      })),
      ctx.locationId
    )
  } catch (error) {
    if (!/already exists/i.test(formatError(error))) throw error
  }

  for (const item of finished) {
    const index = valid[item.job]
    results[index].success = true
    results[index].product_id = item.productId
    results[index].variant_ids = inventory.get(item.productId)
  }

  return { success: results.every((row) => row.success), results }
}

const PRODUCT_READ_FIELDS = [
  "id",
  "title",
  "description",
  "status",
  "images.url",
  "categories.id",
  "categories.name",
  "variants.id",
  "variants.sku",
  "variants.prices.amount",
  "variants.prices.currency_code",
]

export const BATCH_PRODUCT_READ_MAX_ROWS = 50

function presentProductRead(product: GraphRow) {
  const variant = product.variants?.[0] as GraphRow | undefined
  return {
    success: true,
    product_id: product.id,
    sku: variant?.sku,
    name: product.title,
    description: product.description,
    price: variant?.prices?.[0]?.amount,
    status: product.status,
    image_urls: (product.images ?? []).map((img: GraphRow) => img.url),
    category_id: product.categories?.[0]?.id,
    category_name: product.categories?.[0]?.name,
  }
}

export async function getProduct(container: MedusaContainer, productId: string) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "product",
    fields: PRODUCT_READ_FIELDS,
    filters: { id: productId },
  })
  const product = data[0] as GraphRow | undefined
  if (!product) {
    return null
  }
  return presentProductRead(product)
}

export async function getProductsBatch(
  container: MedusaContainer,
  productIds: string[]
) {
  const lookupIds = [...new Set(productIds.filter((productId) => productId.length > 0))]
  const productsById = new Map<string, ReturnType<typeof presentProductRead>>()

  if (lookupIds.length) {
    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const { data } = await query.graph({
      entity: "product",
      fields: PRODUCT_READ_FIELDS,
      filters: { id: lookupIds },
    })
    for (const product of (data ?? []) as GraphRow[]) {
      productsById.set(String(product.id), presentProductRead(product))
    }
  }

  return {
    success: true,
    results: productIds.map((externalProductId, index) => {
      const product = externalProductId
        ? productsById.get(externalProductId)
        : undefined
      if (!product) {
        return {
          index,
          external_product_id: externalProductId,
          found: false,
          error: "product_not_found",
        }
      }
      return {
        index,
        external_product_id: externalProductId,
        found: true,
        product,
      }
    }),
  }
}

export async function exportPrices(
  container: MedusaContainer,
  prices: {
    product_id: string
    variant_id?: string | null
    price?: number | null
    sale_price?: number | null
    old_price?: number | null
  }[]
) {
  const ctx = await getStoreContext(container)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const results: Array<{ success: boolean; product_id: string; error?: string }> =
    prices.map((item) => ({ success: false, product_id: item.product_id }))

  const productIds = [...new Set(prices.map((item) => item.product_id))]
  const { data } = await query.graph({
    entity: "product_variant",
    fields: ["id", "product_id", "metadata"],
    filters: { product_id: productIds },
  })
  const firstByProduct = new Map<string, GraphRow>()
  const byId = new Map<string, GraphRow>()
  for (const row of (data ?? []) as GraphRow[]) {
    byId.set(row.id, row)
    if (!firstByProduct.has(row.product_id)) {
      firstByProduct.set(row.product_id, row)
    }
  }

  const updates: Array<{
    id: string
    prices: { amount: number; currency_code: string }[]
    metadata?: Record<string, string>
  }> = []
  const updateIndex: number[] = []

  for (let i = 0; i < prices.length; i++) {
    const item = prices[i]
    const row = item.variant_id
      ? byId.get(item.variant_id)
      : firstByProduct.get(item.product_id)
    const variantId = row?.id || item.variant_id || firstByProduct.get(item.product_id)?.id
    if (!variantId) {
      results[i].error = "Variant not found"
      continue
    }
    const active = item.price ?? item.sale_price ?? 0
    const old =
      item.old_price != null && item.old_price > active
        ? item.old_price
        : item.sale_price != null && item.price != null && item.price > item.sale_price
          ? item.price
          : item.old_price ?? null
    const metadata: Record<string, string> = {
      ...((row?.metadata as Record<string, string> | undefined) || {}),
    }
    if (old != null && old > active) metadata.old_price = String(old)
    else delete metadata.old_price
    updates.push({
      id: variantId,
      prices: [
        {
          amount: active,
          currency_code: ctx.currency,
        },
      ],
      metadata,
    })
    updateIndex.push(i)
  }

  if (updates.length) {
    try {
      await updateProductVariantsWorkflow(container).run({
        input: { product_variants: updates },
      })
      for (const i of updateIndex) results[i].success = true
    } catch (error) {
      const message = formatError(error)
      for (const i of updateIndex) results[i].error = message
    }
  }

  return { success: results.every((row) => row.success), results }
}

export async function exportStocks(
  container: MedusaContainer,
  stocks: {
    product_id: string
    variant_id?: string | null
    quantity: number
  }[]
) {
  const ctx = await getStoreContext(container)
  const results: Array<{ success: boolean; product_id: string; error?: string }> =
    stocks.map((item) => ({ success: false, product_id: item.product_id }))
  if (!ctx.locationId) {
    return {
      success: false,
      results: results.map((row) => ({
        ...row,
        error: "Variant or warehouse not found",
      })),
    }
  }

  const grouped = new Map<
    string,
    { productId: string; variants: ReturnType<typeof mapProduct>["variants"] }
  >()
  for (let i = 0; i < stocks.length; i++) {
    const item = stocks[i]
    const current = grouped.get(item.product_id) ?? {
      productId: item.product_id,
      variants: [],
    }
    current.variants.push({
      delegatVariantId: item.variant_id || "default",
      title: "",
      options: {},
      amount: 0,
      quantity: item.quantity,
    })
    grouped.set(item.product_id, current)
  }

  try {
    await applyInventoryBulk(container, [...grouped.values()], ctx.locationId)
    for (const row of results) row.success = true
  } catch (error) {
    const message = formatError(error)
    for (const row of results) row.error = message
  }

  return { success: results.every((row) => row.success), results }
}
