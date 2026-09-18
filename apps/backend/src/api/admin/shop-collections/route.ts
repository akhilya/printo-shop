import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { readShopCollectionCover } from "../../../lib/shop-collection-cover"

export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "product_collection",
    fields: ["id", "title", "handle", "metadata"],
    pagination: { skip: 0, take: 200 },
  })
  res.json({
    collections: ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
      id: String(row.id || ""),
      title: String(row.title || ""),
      handle: String(row.handle || ""),
      metadata: (row.metadata || {}) as Record<string, unknown>,
      cover: readShopCollectionCover(row.metadata),
    })),
  })
}
