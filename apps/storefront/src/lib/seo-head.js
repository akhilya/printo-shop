import {
  SHOP_DESCRIPTION,
  SHOP_NAME,
  buildShopSeo,
} from "./seo.js"

function upsertMeta(selector, attrs) {
  if (typeof document === "undefined") return
  let el = document.head.querySelector(selector)
  if (!el) {
    el = document.createElement("meta")
    document.head.appendChild(el)
  }
  for (const [key, value] of Object.entries(attrs)) {
    el.setAttribute(key, value)
  }
}

function upsertLink(rel, href, extra = {}) {
  if (typeof document === "undefined" || !href) return
  const selector = extra.hreflang
    ? `link[rel="${rel}"][hreflang="${extra.hreflang}"]`
    : `link[rel="${rel}"]:not([hreflang])`
  let el = document.head.querySelector(selector)
  if (!el) {
    el = document.createElement("link")
    el.setAttribute("rel", rel)
    document.head.appendChild(el)
  }
  el.setAttribute("href", href)
  for (const [key, value] of Object.entries(extra)) {
    if (value) el.setAttribute(key, value)
    else el.removeAttribute(key)
  }
}

function removeLink(rel) {
  if (typeof document === "undefined") return
  document.head.querySelectorAll(`link[rel="${rel}"]`).forEach((el) => {
    if (rel === "canonical") return
    el.remove()
  })
}

export function applyShopSeo(input) {
  if (typeof document === "undefined") return null
  const seo = buildShopSeo({
    origin: input.origin || window.location.origin,
    path: input.path || window.location.pathname,
    query: input.query,
    title: input.title,
    description: input.description || SHOP_DESCRIPTION,
    image: input.image,
    robots: input.robots,
    ogType: input.ogType,
    crumbs: input.crumbs,
    product: input.product,
    extraJsonLd: input.extraJsonLd,
  })
  document.title = seo.title
  upsertMeta('meta[name="description"]', {
    name: "description",
    content: seo.description,
  })
  upsertMeta('meta[name="robots"]', { name: "robots", content: seo.robots })
  upsertMeta('meta[name="googlebot"]', { name: "googlebot", content: seo.robots })
  upsertMeta('meta[property="og:site_name"]', {
    property: "og:site_name",
    content: SHOP_NAME,
  })
  upsertMeta('meta[property="og:locale"]', {
    property: "og:locale",
    content: "ru_RU",
  })
  upsertMeta('meta[property="og:type"]', {
    property: "og:type",
    content: seo.ogType,
  })
  upsertMeta('meta[property="og:title"]', {
    property: "og:title",
    content: seo.title,
  })
  upsertMeta('meta[property="og:description"]', {
    property: "og:description",
    content: seo.description,
  })
  upsertMeta('meta[property="og:url"]', {
    property: "og:url",
    content: seo.canonical,
  })
  upsertMeta('meta[property="og:image"]', {
    property: "og:image",
    content: seo.image,
  })
  upsertMeta('meta[name="twitter:card"]', {
    name: "twitter:card",
    content: "summary_large_image",
  })
  upsertMeta('meta[name="twitter:title"]', {
    name: "twitter:title",
    content: seo.title,
  })
  upsertMeta('meta[name="twitter:description"]', {
    name: "twitter:description",
    content: seo.description,
  })
  upsertMeta('meta[name="twitter:image"]', {
    name: "twitter:image",
    content: seo.image,
  })
  upsertLink("canonical", seo.canonical)
  upsertLink("alternate", seo.canonical, { hreflang: "ru" })
  upsertLink("alternate", seo.canonical, { hreflang: "x-default" })
  document.head
    .querySelectorAll('link[rel="prev"], link[rel="next"]')
    .forEach((el) => el.remove())
  if (input.prev) upsertLink("prev", input.prev)
  if (input.next) upsertLink("next", input.next)
  let script = document.getElementById("shop-jsonld")
  if (!script) {
    script = document.createElement("script")
    script.id = "shop-jsonld"
    script.type = "application/ld+json"
    document.head.appendChild(script)
  }
  script.textContent = JSON.stringify(seo.jsonLd)
  return seo
}

export { removeLink }
