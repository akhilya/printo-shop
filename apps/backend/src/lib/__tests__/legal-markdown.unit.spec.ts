import { renderLegalMarkdown } from "../legal-markdown"
import { LEGAL_COPY, SELLER_INN, shouldReplaceLegalBody } from "../legal-copy"
import { DEFAULT_LEGAL_PAGES, parseLegalPageInput } from "../legal-page"

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

describe("legal copy", () => {
  it("puts the seller inn on every page", () => {
    for (const page of DEFAULT_LEGAL_PAGES) {
      expect(page.body).toContain(SELLER_INN)
    }
    expect(LEGAL_COPY.offer).toMatch(/оферт/i)
    expect(LEGAL_COPY.offer).toMatch(/ТБанк/)
    expect(LEGAL_COPY.privacy).toMatch(/152-ФЗ/)
    expect(LEGAL_COPY.returns).toMatch(/кнопки/i)
    expect(LEGAL_COPY.delivery).toMatch(/14/)
    expect(LEGAL_COPY.returns).toMatch(/физически не можете забрать/)
    expect(LEGAL_COPY.delivery).not.toMatch(/вернём, когда посылка приедет/)
  })

  it("replaces stubs and keeps a finished text", () => {
    expect(shouldReplaceLegalBody("")).toBe(true)
    expect(
      shouldReplaceLegalBody("Публичная оферта будет опубликована на этой странице.")
    ).toBe(true)
    expect(shouldReplaceLegalBody(LEGAL_COPY.offer)).toBe(false)
  })
})

describe("parseLegalPageInput", () => {
  it("requires a known slug", () => {
    expect(
      parseLegalPageInput({ slug: "home", title: "A", body: "B" })
    ).toEqual({ error: "Неизвестная страница" })
  })

  it("accepts the returns page", () => {
    const parsed = parseLegalPageInput({
      slug: "returns",
      title: "Возврат",
      body: "Только по письму",
    })
    expect("error" in parsed).toBe(false)
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
