import { MedusaContainer } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import {
  createCollectionsWorkflow,
  updateCollectionsWorkflow,
  updateProductsWorkflow,
} from "@medusajs/medusa/core-flows"
import { groupHandle, readGroupRef } from "./map-product"

type GraphRow = Record<string, any>

export type DelegatGroupPayload = {
  collection_id?: string | null
  delegat_group_id?: string | null
  name: string
  description?: string | null
  product_ids?: string[] | null
  replace?: boolean | null
}

let collectionsCache: { at: number; value: GraphRow[] } | null = null
const COLLECTIONS_TTL_MS = 15_000

async function listCollections(container: MedusaContainer, force = false) {
  if (
    !force &&
    collectionsCache &&
    Date.now() - collectionsCache.at < COLLECTIONS_TTL_MS
  ) {
    return collectionsCache.value
  }
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "product_collection",
    fields: ["id", "title", "handle", "metadata"],
  })
  const value = (data ?? []) as GraphRow[]
  collectionsCache = { at: Date.now(), value }
  return value
}

export async function findCollectionId(
  container: MedusaContainer,
  payload: {
    collection_id?: string | null
    delegat_group_id?: string | null
    name?: string | null
  }
) {
  const collections = await listCollections(container)
  if (payload.collection_id) {
    const hit = collections.find((c) => c.id === payload.collection_id)
    if (hit?.id) return String(hit.id)
  }
  if (payload.delegat_group_id) {
    const needle = String(payload.delegat_group_id)
    const hit = collections.find((c) => c.metadata?.delegat_group_id === needle)
    if (hit?.id) return String(hit.id)
  }
  const name = payload.name?.trim()
  if (name) {
    const hit = collections.find((c) => c.title === name)
    if (hit?.id) return String(hit.id)
  }
  return null
}

export async function resolveCollectionIdForProduct(
  container: MedusaContainer,
  payload: {
    group_id?: string | number | null
    groupId?: string | number | null
    group_name?: string | null
    groupName?: string | null
    raw_fields?: Record<string, unknown> | null
  }
) {
  const { groupId, groupName } = readGroupRef(payload)
  if (!groupId && !groupName) return null

  const existing = await findCollectionId(container, {
    delegat_group_id: groupId,
    name: groupName,
  })
  if (existing) return existing

  const title = groupName || `Группа ${groupId}`
  const { result } = await createCollectionsWorkflow(container).run({
    input: {
      collections: [
        {
          title,
          handle: groupHandle(title, groupId),
          metadata: groupId ? { delegat_group_id: groupId } : undefined,
        },
      ],
    },
  })
  collectionsCache = null
  return result[0]?.id ?? null
}

async function setProductCollection(
  container: MedusaContainer,
  productId: string,
  collectionId: string | null
) {
  await updateProductsWorkflow(container).run({
    input: {
      selector: { id: productId },
      update: { collection_id: collectionId },
    },
  })
}

async function productsInCollection(container: MedusaContainer, collectionId: string) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "product",
    fields: ["id"],
    filters: { collection_id: collectionId },
  })
  return ((data ?? []) as GraphRow[]).map((p) => String(p.id)).filter(Boolean)
}

async function productExists(container: MedusaContainer, id: string) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "product",
    fields: ["id"],
    filters: { id },
  })
  return Boolean(data[0]?.id)
}

async function assignProducts(
  container: MedusaContainer,
  collectionId: string,
  productIds: string[],
  replace: boolean
) {
  const wanted = [...new Set(productIds.filter(Boolean))]
  if (replace) {
    const current = await productsInCollection(container, collectionId)
    const wantedSet = new Set(wanted)
    for (const id of current) {
      if (!wantedSet.has(id)) {
        await setProductCollection(container, id, null)
      }
    }
  }
  let added = 0
  let failed = 0
  for (const id of wanted) {
    if (!(await productExists(container, id))) {
      failed += 1
      continue
    }
    await setProductCollection(container, id, collectionId)
    added += 1
  }
  return { added, failed }
}

export async function upsertGroup(
  container: MedusaContainer,
  payload: DelegatGroupPayload
) {
  const name = payload.name?.trim()
  if (!name) {
    return { success: false, error: "Group name is required" }
  }

  const metadata: Record<string, string> = {}
  if (payload.delegat_group_id) {
    metadata.delegat_group_id = String(payload.delegat_group_id)
  }

  let collectionId = await findCollectionId(container, payload)

  if (collectionId) {
    await updateCollectionsWorkflow(container).run({
      input: {
        selector: { id: collectionId },
        update: {
          title: name,
          metadata: Object.keys(metadata).length ? metadata : undefined,
        },
      },
    })
  } else {
    const { result } = await createCollectionsWorkflow(container).run({
      input: {
        collections: [
          {
            title: name,
            handle: groupHandle(name, payload.delegat_group_id),
            metadata: Object.keys(metadata).length ? metadata : undefined,
          },
        ],
      },
    })
    collectionId = result[0]?.id
    collectionsCache = null
  }

  if (!collectionId) {
    return { success: false, error: "Failed to upsert collection" }
  }

  if (payload.product_ids) {
    await assignProducts(
      container,
      collectionId,
      payload.product_ids,
      payload.replace === true
    )
  }

  return { success: true, collection_id: collectionId, name }
}

export async function addProductsToGroup(
  container: MedusaContainer,
  collectionId: string,
  productIds: string[]
) {
  if (!(await findCollectionId(container, { collection_id: collectionId }))) {
    return { success: false, error: "Group not found", added: 0, failed: productIds.length }
  }
  const result = await assignProducts(container, collectionId, productIds, false)
  return { success: result.failed === 0, ...result }
}

export async function removeProductsFromGroup(
  container: MedusaContainer,
  collectionId: string,
  productIds: string[]
) {
  let removed = 0
  for (const id of [...new Set(productIds.filter(Boolean))]) {
    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const { data } = await query.graph({
      entity: "product",
      fields: ["id", "collection_id"],
      filters: { id },
    })
    if (data[0]?.collection_id !== collectionId) continue
    await setProductCollection(container, id, null)
    removed += 1
  }
  return { success: true, removed }
}

export async function deleteGroup(container: MedusaContainer, collectionId: string) {
  const current = await productsInCollection(container, collectionId)
  for (const id of current) {
    await setProductCollection(container, id, null)
  }
  return { success: true, collection_id: collectionId, unassigned: current.length }
}

export async function listGroups(container: MedusaContainer) {
  const collections = await listCollections(container)
  const groups: Array<{
    id: string
    name: string
    handle: string
    product_ids: string[]
  }> = []
  for (const collection of collections) {
    const productIds = await productsInCollection(container, collection.id)
    groups.push({
      id: collection.id,
      name: collection.title,
      handle: collection.handle,
      product_ids: productIds,
    })
  }
  return { success: true, groups }
}
