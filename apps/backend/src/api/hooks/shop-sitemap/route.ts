import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { listShopGroupsCatalog } from "../../../lib/shop-catalog"
import { shopSitemapDocument } from "../../../lib/shop-sitemap"

export const AUTHENTICATE = false

const PRODUCT_PAGE = 300
const PRODUCT_CAP = 10000

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  try {
    const extra: Array<{
      path: string
      lastmod?: string | Date | null
      changefreq?: string
      priority?: string
    }> = []
    const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
    for (let skip = 0; skip < PRODUCT_CAP; skip += PRODUCT_PAGE) {
      const { data } = await query.graph({
        entity: "product",
        fields: ["handle", "updated_at"],
        filters: { status: "published" },
        pagination: { skip, take: PRODUCT_PAGE },
      })
      const batch = (data ?? []) as Array<Record<string, unknown>>
      for (const row of batch) {
        const handle = String(row.handle || "").trim()
        if (!handle) continue
        extra.push({
          path: `/p/${handle}`,
          lastmod: row.updated_at ? String(row.updated_at) : null,
          changefreq: "weekly",
          priority: "0.7",
        })
      }
      if (batch.length < PRODUCT_PAGE) break
    }
    try {
      const groups = await listShopGroupsCatalog(req.scope)
      for (const group of groups) {
        extra.push({
          path: group.path,
          changefreq: "weekly",
          priority: "0.6",
        })
      }
    } catch {
      // collections are optional in the sitemap
    }
    const xml = shopSitemapDocument(process.env, extra)
    res.setHeader("Content-Type", "application/xml; charset=utf-8")
    res.setHeader("Cache-Control", "public, max-age=3600, stale-while-revalidate=86400")
    res.status(200).send(xml)
  } catch {
    res.status(500).json({ message: "Не удалось собрать карту сайта." })
  }
}
