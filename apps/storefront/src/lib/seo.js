export const SHOP_NAME = "PrintO.studio"
export const SHOP_DESCRIPTION =
  "Фигурки в магазине PrintO. Каталог, коллекции и заказ по России."
export const SHOP_OG_IMAGE = "/logo-wide.webp"

const NOINDEX_PREFIXES = [
  "/checkout",
  "/order",
  "/custom-order/pay",
]

export function seoPlainText(value, max = 160) {
  const text = String(value || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
  if (!max || text.length <= max) return text
  const sliced = text.slice(0, max - 1)
  const cut = sliced.lastIndexOf(" ")
  return `${(cut > 80 ? sliced.slice(0, cut) : sliced).trim()}…`
}

export function shopSeoTitle(pageTitle) {
  const page = String(pageTitle || "").trim()
  if (!page || page === SHOP_NAME) return SHOP_NAME
  if (page.endsWith(SHOP_NAME)) return page
  return `${page} — ${SHOP_NAME}`
}

export function shopOrigin(origin) {
  return String(origin || "").replace(/\/$/, "")
}

export function shopAbsoluteUrl(origin, path = "/") {
  const base = shopOrigin(origin)
  const value = String(path || "/")
  if (/^https?:\/\//i.test(value)) return value
  const loc = value.startsWith("/") ? value : `/${value}`
  return `${base}${loc}`
}

export function shopCanonicalPath(path, query = {}) {
  const loc = String(path || "/") || "/"
  const params = new URLSearchParams()
  const q = typeof query.q === "string" ? query.q.trim() : ""
  const c = typeof query.c === "string" ? query.c.trim() : ""
  const page = String(query.page || "").trim()
  if (q) params.set("q", q)
  if (c) params.set("c", c)
  if (page && page !== "1") params.set("page", page)
  const search = params.toString()
  return search ? `${loc}?${search}` : loc
}

export function shopRobots(path, query = {}) {
  const loc = String(path || "/")
  if (NOINDEX_PREFIXES.some((prefix) => loc === prefix || loc.startsWith(`${prefix}/`))) {
    return "noindex, nofollow"
  }
  if (typeof query.q === "string" && query.q.trim()) {
    return "noindex, follow"
  }
  return "index, follow"
}

export function shopJsonLdGraph(nodes) {
  return {
    "@context": "https://schema.org",
    "@graph": (nodes || []).filter(Boolean),
  }
}

export function shopOrganizationNode(origin) {
  const url = shopOrigin(origin)
  return {
    "@type": "Organization",
    "@id": `${url}/#organization`,
    name: SHOP_NAME,
    url,
    logo: shopAbsoluteUrl(url, SHOP_OG_IMAGE),
  }
}

export function shopWebsiteNode(origin) {
  const url = shopOrigin(origin)
  return {
    "@type": "WebSite",
    "@id": `${url}/#website`,
    url,
    name: SHOP_NAME,
    inLanguage: "ru-RU",
    publisher: { "@id": `${url}/#organization` },
    potentialAction: {
      "@type": "SearchAction",
      target: `${url}/products?q={search_term_string}`,
      "query-input": "required name=search_term_string",
    },
    hasPart: {
      "@type": "DataCatalog",
      name: "Каталог для моделей",
      url: `${url}/llm.json`,
      encodingFormat: "application/json",
    },
  }
}

export function shopBreadcrumbNode(origin, crumbs) {
  const items = (crumbs || []).filter((item) => item?.name && item?.path)
  if (!items.length) return null
  return {
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: shopAbsoluteUrl(origin, item.path),
    })),
  }
}

export function shopProductNode(input) {
  const origin = shopOrigin(input.origin)
  const path = String(input.path || "")
  const name = String(input.name || "").trim()
  if (!name || !path) return null
  const image = input.image ? shopAbsoluteUrl(origin, input.image) : undefined
  const node = {
    "@type": "Product",
    name,
    url: shopAbsoluteUrl(origin, path),
    image: image || undefined,
    description: seoPlainText(input.description, 500) || undefined,
    sku: input.sku || undefined,
    brand: { "@type": "Brand", name: SHOP_NAME },
    isFamilyFriendly: input.adult ? false : undefined,
  }
  const price = Number(input.price)
  if (Number.isFinite(price) && price >= 0) {
    node.offers = {
      "@type": "Offer",
      url: shopAbsoluteUrl(origin, path),
      priceCurrency: "RUB",
      price: String(Math.round(price)),
      availability: input.inStock
        ? "https://schema.org/InStock"
        : "https://schema.org/OutOfStock",
      itemCondition: "https://schema.org/NewCondition",
    }
  }
  const ratingCount = Number(input.ratingCount) || 0
  const ratingValue = Number(input.ratingValue)
  if (ratingCount > 0 && Number.isFinite(ratingValue) && ratingValue > 0) {
    node.aggregateRating = {
      "@type": "AggregateRating",
      ratingValue: String(ratingValue),
      reviewCount: String(ratingCount),
      bestRating: "5",
      worstRating: "1",
    }
  }
  return node
}

export function buildShopSeo(input) {
  const origin = shopOrigin(input.origin || "")
  const path = shopCanonicalPath(input.path || "/", input.query || {})
  const title = shopSeoTitle(input.title)
  const description = seoPlainText(input.description || SHOP_DESCRIPTION, 160)
  const image = shopAbsoluteUrl(origin, input.image || SHOP_OG_IMAGE)
  const canonical = shopAbsoluteUrl(origin, path)
  const robots = input.robots || shopRobots(input.path || "/", input.query || {})
  const jsonLd = shopJsonLdGraph([
    shopOrganizationNode(origin),
    shopWebsiteNode(origin),
    shopBreadcrumbNode(origin, input.crumbs),
    input.product,
    ...(input.extraJsonLd || []),
  ])
  return {
    title,
    description,
    canonical,
    robots,
    image,
    ogType: input.ogType || "website",
    jsonLd,
  }
}
