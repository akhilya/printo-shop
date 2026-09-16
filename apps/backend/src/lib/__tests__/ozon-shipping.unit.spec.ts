import {
  parseOzonFixedAmount,
  parseOzonQuoteMode,
  resolveOzonQuoteAmount,
} from "../ozon-shipping"

describe("resolveOzonQuoteAmount", () => {
  it("uses the live ozon quote by default", () => {
    expect(
      resolveOzonQuoteAmount({ quoted: 320, fixedAmount: 350 })
    ).toBe(320)
    expect(resolveOzonQuoteAmount({ quoted: 0, fixedAmount: 350 })).toBeNull()
  })

  it("uses the fixed amount when that mode is on", () => {
    expect(
      resolveOzonQuoteAmount({
        mode: "fixed",
        quoted: 320,
        fixedAmount: 350,
      })
    ).toBe(350)
    expect(
      resolveOzonQuoteAmount({ mode: "fixed", quoted: null, fixedAmount: " 499 " })
    ).toBe(499)
    expect(
      resolveOzonQuoteAmount({ mode: "fixed", quoted: 320, fixedAmount: 0 })
    ).toBeNull()
  })
})

describe("parseOzonQuoteMode", () => {
  it("only treats fixed as a separate mode", () => {
    expect(parseOzonQuoteMode("fixed")).toBe("fixed")
    expect(parseOzonQuoteMode("ozon")).toBe("ozon")
    expect(parseOzonQuoteMode("")).toBe("ozon")
  })
})

describe("parseOzonFixedAmount", () => {
  it("keeps a positive ruble amount", () => {
    expect(parseOzonFixedAmount(350.4)).toBe(350)
    expect(parseOzonFixedAmount(-1)).toBeNull()
  })
})
