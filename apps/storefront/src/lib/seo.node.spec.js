import { describe, it } from "node:test"
import assert from "node:assert/strict"
import {
  SHOP_NAME,
  buildShopSeo,
  seoPlainText,
  shopAbsoluteUrl,
  shopCanonicalPath,
  shopProductNode,
  shopRobots,
  shopSeoTitle,
} from "./seo.js"

describe("shop seo", () => {
  it("builds titles and strips html from descriptions", () => {
    assert.equal(shopSeoTitle(""), SHOP_NAME)
    assert.equal(shopSeoTitle("Товары"), `Товары — ${SHOP_NAME}`)
    assert.equal(
      seoPlainText("<p>Страж 75 мм.  Смола.</p>", 20),
      "Страж 75 мм. Смола."
    )
  })

  it("keeps catalog filters in the canonical path and hides checkout", () => {
    assert.equal(
      shopCanonicalPath("/products", { q: "orc", page: "2" }),
      "/products?q=orc&page=2"
    )
    assert.equal(shopRobots("/checkout"), "noindex, nofollow")
    assert.equal(shopRobots("/order/123"), "noindex, nofollow")
    assert.equal(shopRobots("/products", { q: "орк" }), "noindex, follow")
    assert.equal(shopRobots("/products"), "index, follow")
  })

  it("builds a product offer node", () => {
    const node = shopProductNode({
      origin: "https://printo.studio",
      path: "/p/strazh",
      name: "Страж",
      image: "https://cdn/x.webp",
      description: "Фигурка 75 мм",
      sku: "WA150",
      price: 1490,
      inStock: true,
      ratingCount: 2,
      ratingValue: 4.5,
    })
    assert.equal(node["@type"], "Product")
    assert.equal(node.offers.price, "1490")
    assert.equal(node.aggregateRating.reviewCount, "2")
  })

  it("fills open graph fields", () => {
    const seo = buildShopSeo({
      origin: "https://printo.studio",
      path: "/",
      title: SHOP_NAME,
    })
    assert.equal(seo.canonical, "https://printo.studio/")
    assert.equal(seo.ogType, "website")
    assert.equal(shopAbsoluteUrl("https://printo.studio", "/logo-wide.webp"), "https://printo.studio/logo-wide.webp")
  })
})
