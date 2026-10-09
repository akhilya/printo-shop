import { customOrderOzonArticle } from "../custom-order-pay"

describe("customOrderOzonArticle", () => {
  it("uses the catalog sku, not the custom order id", () => {
    expect(
      customOrderOzonArticle(
        { id: "cuord_01ABCDEFGHIJKLMNOPQRSTUV" },
        [{ sku: "DD30" }]
      )
    ).toBe("DD30")
  })

  it("returns nothing when the linked product has no Ozon article", () => {
    expect(
      customOrderOzonArticle(
        { id: "cuord_01ABCDEFGHIJKLMNOPQRSTUV" },
        [{ sku: "variant_01ABCDEFGHIJKLMNOPQRSTUV" }]
      )
    ).toBe("")
  })

  it("uses the shop article when the order has no product sku", () => {
    expect(
      customOrderOzonArticle(
        { id: "cuord_01ABCDEFGHIJKLMNOPQRSTUV" },
        [],
        "CUSTOM-1"
      )
    ).toBe("CUSTOM-1")
  })

  it("prefers the linked product sku over the shop article", () => {
    expect(
      customOrderOzonArticle(
        { id: "cuord_01ABCDEFGHIJKLMNOPQRSTUV" },
        [{ sku: "DD30" }],
        "CUSTOM-1"
      )
    ).toBe("DD30")
  })
})
