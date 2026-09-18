import { storefrontOrigin } from "./custom-order"
import { LEGAL_SLUGS } from "./legal-page"

export const SHOP_SITEMAP_STATICS = [
  { path: "/", changefreq: "daily", priority: "1.0" },
  { path: "/products", changefreq: "daily", priority: "0.9" },
  { path: "/collections", changefreq: "weekly", priority: "0.8" },
  { path: "/custom-order", changefreq: "monthly", priority: "0.5" },
  ...LEGAL_SLUGS.map((slug) => ({
    path: `/${slug}`,
    changefreq: "monthly",
    priority: "0.4",
  })),
]

function xmlEscape(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

export function shopSitemapUrl(
  origin: string,
  path: string,
  extra: { lastmod?: string | Date | null; changefreq?: string; priority?: string } = {}
) {
  const base = String(origin || "").replace(/\/$/, "")
  const loc = path.startsWith("/") ? path : `/${path}`
  let lastmod = ""
  if (extra.lastmod) {
    const date = extra.lastmod instanceof Date ? extra.lastmod : new Date(extra.lastmod)
    if (!Number.isNaN(date.getTime())) lastmod = date.toISOString().slice(0, 10)
  }
  return {
    loc: `${base}${loc === "/" ? "/" : loc}`,
    lastmod: lastmod || null,
    changefreq: extra.changefreq || "weekly",
    priority: extra.priority || "0.5",
  }
}

export function renderShopSitemap(urls: Array<ReturnType<typeof shopSitemapUrl>>) {
  const rows = urls
    .filter((row) => row.loc)
    .map((row) => {
      const lastmod = row.lastmod ? `\n    <lastmod>${xmlEscape(row.lastmod)}</lastmod>` : ""
      return `  <url>\n    <loc>${xmlEscape(row.loc)}</loc>${lastmod}\n    <changefreq>${xmlEscape(row.changefreq)}</changefreq>\n    <priority>${xmlEscape(row.priority)}</priority>\n  </url>`
    })
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${rows.join("\n")}\n</urlset>\n`
}

export function shopSitemapDocument(
  env: NodeJS.ProcessEnv,
  extra: Array<{ path: string; lastmod?: string | Date | null; changefreq?: string; priority?: string }>
) {
  const origin = storefrontOrigin(env)
  const urls = [
    ...SHOP_SITEMAP_STATICS.map((row) => shopSitemapUrl(origin, row.path, row)),
    ...extra.map((row) => shopSitemapUrl(origin, row.path, row)),
  ]
  const seen = new Set<string>()
  const unique = urls.filter((row) => {
    if (seen.has(row.loc)) return false
    seen.add(row.loc)
    return true
  })
  return renderShopSitemap(unique)
}
