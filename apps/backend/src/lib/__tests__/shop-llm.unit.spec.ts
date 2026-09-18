import {
  renderLlmJson,
  renderLlmsFull,
  renderLlmsTxt,
} from "../shop-llm"

const catalog = {
  origin: "https://printo.studio",
  collections: [
    { title: "Стражи", path: "/collections/col_1", count: 4 },
  ],
  products: [
    { title: "Страж", handle: "strazh", summary: "Фигурка 75 мм" },
  ],
}

describe("shop llm index", () => {
  it("writes an llms.txt index with pages and a full-catalog link", () => {
    const text = renderLlmsTxt(catalog)
    expect(text).toContain("# PrintO.studio")
    expect(text).toContain("https://printo.studio/products")
    expect(text).toContain("[Стражи](https://printo.studio/collections/col_1)")
    expect(text).toContain("[Страж](https://printo.studio/p/strazh)")
    expect(text).toContain("https://printo.studio/llms-full.txt")
    expect(text).not.toContain("/checkout")
  })

  it("lists every product in the full text and json catalog", () => {
    const full = renderLlmsFull(catalog)
    const json = renderLlmJson(catalog)
    expect(full).toContain("полный каталог")
    expect(json.products[0]).toMatchObject({
      name: "Страж",
      url: "https://printo.studio/p/strazh",
    })
    expect(json.pages.some((page) => page.url.endsWith("/privacy"))).toBe(true)
  })
})
