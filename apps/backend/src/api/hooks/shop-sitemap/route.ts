import type { MedusaContainer } from "@medusajs/framework/types"
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import {
  catalogSitemapEntries,
  listShopGroupsCatalog,
} from "../../../lib/shop-catalog"
import { shopSitemapDocument } from "../../../lib/shop-sitemap"

export const AUTHENTICATE = false

const PRODUCT_PAGE = 300
const PRODUCT_CAP = 10000
const SITEMAP_TTL_MS = 10 * 60_000

let sitemapCache: { at: number; xml: string } | null = null
let sitemapInflight: Promise<string> | null = null

function sendSitemap(res: MedusaResponse, xml: string) {
  res.setHeader("Content-Type", "application/xml; charset=utf-8")
  res.setHeader(
    "Cache-Control",
    "public, max-age=3600, stale-while-revalidate=86400"
  )
  res.status(200).send(xml)
}

async function productEntries(container: MedusaContainer) {
  const cached = catalogSitemapEntries()
  if (cached) return cached
  const extra: Array<{
    path: string
    lastmod?: string | Date | null
    changefreq?: string
    priority?: string
  }> = []
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
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
  return extra
}

async function buildSitemap(container: MedusaContainer) {
  const extra = await productEntries(container)
  try {
    const groups = await listShopGroupsCatalog(container)
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
  sitemapCache = { at: Date.now(), xml }
  return xml
}

function rebuildSitemap(container: MedusaContainer) {
  if (sitemapInflight) return sitemapInflight
  sitemapInflight = buildSitemap(container).finally(() => {
    sitemapInflight = null
  })
  return sitemapInflight
}

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  try {
    const fresh =
      sitemapCache && Date.now() - sitemapCache.at < SITEMAP_TTL_MS
    if (sitemapCache && fresh) {
      sendSitemap(res, sitemapCache.xml)
      return
    }
    if (sitemapCache) {
      void rebuildSitemap(req.scope)
      sendSitemap(res, sitemapCache.xml)
      return
    }
    sendSitemap(res, await rebuildSitemap(req.scope))
  } catch {
    res.status(500).json({ message: "Не удалось собрать карту сайта." })
  }
}
