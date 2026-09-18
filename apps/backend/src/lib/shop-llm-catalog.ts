import { MedusaContainer } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { listShopGroupsCatalog } from "./shop-catalog"
import {
  llmPlainText,
  type ShopLlmCollection,
  type ShopLlmProduct,
} from "./shop-llm"

const PAGE = 300
const CAP = 10000

export async function loadShopLlmCatalog(container: MedusaContainer) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const products: ShopLlmProduct[] = []
  for (let skip = 0; skip < CAP; skip += PAGE) {
    const { data } = await query.graph({
      entity: "product",
      fields: ["title", "handle", "description"],
      filters: { status: "published" },
      pagination: { skip, take: PAGE },
    })
    const batch = (data ?? []) as Array<Record<string, unknown>>
    for (const row of batch) {
      const handle = String(row.handle || "").trim()
      const title = String(row.title || "").trim()
      if (!handle || !title) continue
      products.push({
        title,
        handle,
        summary: llmPlainText(row.description, 140),
      })
    }
    if (batch.length < PAGE) break
  }
  let collections: ShopLlmCollection[] = []
  try {
    collections = (await listShopGroupsCatalog(container)).map((group) => ({
      title: group.title,
      path: group.path,
      count: group.count,
    }))
  } catch {
    collections = []
  }
  return { products, collections }
}
