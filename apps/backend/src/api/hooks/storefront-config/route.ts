import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

export async function OPTIONS(_req: MedusaRequest, res: MedusaResponse) {
  res.status(204).end()
}

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data: keys } = await query.graph({
    entity: "api_key",
    fields: ["id", "title", "type", "token", "revoked_at"],
  })
  const publishable = ((keys ?? []) as Array<Record<string, unknown>>)
    .filter((row) => row.type === "publishable" && !row.revoked_at && row.token)
    .sort((a, b) => {
      const aScore = String(a.title || "").toLowerCase().includes("store") ? 0 : 1
      const bScore = String(b.title || "").toLowerCase().includes("store") ? 0 : 1
      if (aScore !== bScore) return aScore - bScore
      return String(a.id || "").localeCompare(String(b.id || ""))
    })[0]

  const { data: regions } = await query.graph({
    entity: "region",
    fields: ["id", "name", "currency_code"],
  })
  const list = (regions ?? []) as Array<Record<string, unknown>>
  const region =
    list.find((row) => String(row.currency_code || "").toLowerCase() === "rub") ||
    list[0]

  res.json({
    publishable_key: publishable ? String(publishable.token) : "",
    region_id: region ? String(region.id) : "",
  })
}
