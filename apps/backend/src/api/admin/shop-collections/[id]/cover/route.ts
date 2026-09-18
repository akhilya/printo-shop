import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { updateCollectionsWorkflow } from "@medusajs/medusa/core-flows"
import { invalidateShopCatalogCache } from "../../../../../lib/shop-catalog"
import {
  mergeShopCollectionCoverMetadata,
  parseShopCollectionCover,
  readShopCollectionCover,
} from "../../../../../lib/shop-collection-cover"

export async function POST(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) {
  const id = String(req.params.id || "").trim()
  const parsed = parseShopCollectionCover(req.body)
  if ("error" in parsed) {
    res.status(400).json({ message: parsed.error })
    return
  }

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "product_collection",
    fields: ["id", "metadata"],
    filters: { id },
  })
  const collection = (data?.[0] || null) as Record<string, unknown> | null
  if (!collection?.id) {
    res.status(404).json({ message: "Коллекция не найдена" })
    return
  }

  const metadata = mergeShopCollectionCoverMetadata(collection.metadata, parsed)
  await updateCollectionsWorkflow(req.scope).run({
    input: {
      selector: { id },
      update: { metadata },
    },
  })
  invalidateShopCatalogCache()
  res.json({ cover: readShopCollectionCover(metadata) })
}
