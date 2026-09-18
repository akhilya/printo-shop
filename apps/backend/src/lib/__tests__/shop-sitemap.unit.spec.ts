import { renderShopSitemap, shopSitemapDocument, shopSitemapUrl } from "../shop-sitemap"

describe("shop sitemap", () => {
  it("escapes urls and includes catalog pages", () => {
    const xml = renderShopSitemap([
      shopSitemapUrl("https://printo.studio", "/p/a&b", {
        lastmod: "2026-09-18",
        priority: "0.7",
      }),
    ])
    expect(xml).toContain("https://printo.studio/p/a&amp;b")
    expect(xml).toContain("<lastmod>2026-09-18</lastmod>")
  })

  it("adds static storefront paths from the shop origin", () => {
    const xml = shopSitemapDocument(
      { STORE_CORS: "https://printo.studio" },
      [{ path: "/p/strazh", lastmod: "2026-09-01" }]
    )
    expect(xml).toContain("https://printo.studio/</loc>")
    expect(xml).toContain("https://printo.studio/products")
    expect(xml).toContain("https://printo.studio/p/strazh")
    expect(xml).toContain("https://printo.studio/privacy")
  })
})
