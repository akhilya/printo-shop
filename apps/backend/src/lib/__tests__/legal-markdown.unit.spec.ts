import { renderLegalMarkdown } from "../legal-markdown"
import { LEGAL_COPY, SELLER_INN, shouldReplaceLegalBody } from "../legal-copy"
import {
  DEFAULT_LEGAL_PAGES,
  parseLegalPageInput,
  presentLegalPage,
  presentLegalPageNav,
} from "../legal-page"

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
    expect(LEGAL_COPY.returns).toMatch(/после того, как вы забрали/)
    expect(LEGAL_COPY.returns).toMatch(/появляется, когда статус/)
    expect(LEGAL_COPY.delivery).toMatch(/14/)
    expect(LEGAL_COPY.returns).toMatch(/физически не можете забрать/)
    expect(LEGAL_COPY.delivery).not.toMatch(/вернём, когда посылка приедет/)
    expect(LEGAL_COPY.offer).toMatch(/только после получения/)
  })

  it("replaces stubs and keeps a finished text", () => {
    expect(shouldReplaceLegalBody("")).toBe(true)
    expect(
      shouldReplaceLegalBody("Публичная оферта будет опубликована на этой странице.")
    ).toBe(true)
    expect(shouldReplaceLegalBody(LEGAL_COPY.offer)).toBe(false)
    expect(shouldReplaceLegalBody(LEGAL_COPY.returns)).toBe(false)
    expect(
      shouldReplaceLegalBody(
        "Кнопки «вернуть заказ» на сайте нет. Сдать товар в пункт выдачи Ozon после получения, как на маркетплейсе, нельзя."
      )
    ).toBe(true)
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

describe("presentLegalPageNav", () => {
  it("omits body and html from the listing payload", () => {
    const row = {
      id: "lp_1",
      slug: "offer",
      title: "Оферта",
      body: "## Договор\n\nТекст оферты",
      enabled: true,
    }
    expect(presentLegalPageNav(row)).toEqual({
      id: "lp_1",
      slug: "offer",
      title: "Оферта",
      enabled: true,
    })
    const full = presentLegalPage(row)
    expect(full.body).toContain("Текст оферты")
    expect(full.html).toContain("<h3>Договор</h3>")
  })
})
