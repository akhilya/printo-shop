import { renderLegalMarkdown } from "../legal-markdown"
import { parseLegalPageInput } from "../legal-page"

describe("renderLegalMarkdown", () => {
  it("renders headings, lists and safe links", () => {
    const html = renderLegalMarkdown(
      "## Доставка\n\nПишем на [почту](mailto:shop@test.com).\n\n- СДЭК\n- Почта России"
    )
    expect(html).toContain("<h3>Доставка</h3>")
    expect(html).toContain('href="mailto:shop@test.com"')
    expect(html).toContain("<ul>")
    expect(html).toContain("<li>СДЭК</li>")
  })

  it("drops javascript links and raw tags", () => {
    const html = renderLegalMarkdown(
      '[x](javascript:alert(1))\n\n<script>alert(1)</script>\n\n**важно**'
    )
    expect(html).not.toContain("javascript:")
    expect(html).not.toContain("<script>")
    expect(html).toContain("&lt;script&gt;")
    expect(html).toContain("<strong>важно</strong>")
  })
})

describe("parseLegalPageInput", () => {
  it("requires a known slug", () => {
    expect(
      parseLegalPageInput({ slug: "home", title: "A", body: "B" })
    ).toEqual({ error: "Неизвестная страница" })
  })

  it("accepts a delivery page", () => {
    const parsed = parseLegalPageInput({
      slug: "delivery",
      title: "Доставка",
      body: "По России",
    })
    expect("error" in parsed).toBe(false)
    if ("error" in parsed) return
    expect(parsed.enabled).toBe(true)
  })
})
