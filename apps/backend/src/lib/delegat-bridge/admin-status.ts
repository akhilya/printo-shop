import { MedusaContainer } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { createApiKeysWorkflow } from "@medusajs/medusa/core-flows"
import { getHealth } from "./service"

async function countEntity(
  container: MedusaContainer,
  entity: string
): Promise<number> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const result = await query.graph({
    entity,
    fields: ["id"],
    pagination: { skip: 0, take: 1 },
  })
  const count = (result as { metadata?: { count?: number } }).metadata?.count
  if (typeof count === "number") return count
  const { data } = await query.graph({
    entity,
    fields: ["id"],
  })
  return (data ?? []).length
}

export async function getDelegatStatus(
  container: MedusaContainer,
  backendUrl?: string
) {
  const health = await getHealth(container)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data: keys } = await query.graph({
    entity: "api_key",
    fields: ["id", "title", "type", "created_at", "revoked_at"],
  })
  const secretKeys = ((keys ?? []) as Array<Record<string, unknown>>)
    .filter((row) => row.type === "secret" && !row.revoked_at)
    .map((row) => ({
      id: String(row.id || ""),
      title: String(row.title || ""),
      created_at: row.created_at ? String(row.created_at) : undefined,
    }))

  const base = (backendUrl || "http://localhost:9000").replace(/\/$/, "")
  const [products, collections, categories] = await Promise.all([
    countEntity(container, "product"),
    countEntity(container, "product_collection"),
    countEntity(container, "product_category"),
  ])

  return {
    ...health,
    api_base_url: `${base}/admin/delegat`,
    products,
    collections,
    categories,
    api_keys: secretKeys,
  }
}

export async function createDelegatApiKey(container: MedusaContainer) {
  const { result } = await createApiKeysWorkflow(container).run({
    input: {
      api_keys: [
        {
          title: "Delegat",
          type: "secret",
          created_by: "",
        },
      ],
    },
  })
  const key = result[0] as { token?: string; id?: string; title?: string }
  return {
    id: key.id || "",
    title: key.title || "Delegat",
    token: key.token || "",
  }
}
