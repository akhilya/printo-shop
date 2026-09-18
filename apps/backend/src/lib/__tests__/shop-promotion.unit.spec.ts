import {
  parseShopPromotionCreate,
  parseShopPromotionUpdate,
  presentShopPromotion,
  promotionCodesFromOrder,
  promotionDiscountAmount,
  promotionUsesLabel,
  tallyPromotionUses,
} from "../shop-promotion"

describe("parseShopPromotionCreate", () => {
  it("maps include shipping to an order-wide promotion", () => {
    expect(
      parseShopPromotionCreate({
        code: "leto10",
        type: "percentage",
        value: 10,
        include_shipping: true,
      })
    ).toMatchObject({
      code: "LETO10",
      application_method: {
        type: "percentage",
        value: 10,
        target_type: "order",
      },
    })
  })

  it("keeps the discount on items when delivery is excluded", () => {
    expect(
      parseShopPromotionCreate({
        code: "FIG10",
        type: "fixed",
        value: 150,
      })
    ).toMatchObject({
      application_method: {
        type: "fixed",
        value: 150,
        target_type: "items",
      },
    })
  })
})

describe("parseShopPromotionUpdate", () => {
  it("switches an existing promotion between items and order", () => {
    expect(parseShopPromotionUpdate({ include_shipping: true })).toMatchObject({
      application_method: { target_type: "order" },
    })
    expect(parseShopPromotionUpdate({ include_shipping: false })).toMatchObject({
      application_method: { target_type: "items" },
    })
  })

  it("accepts an active or inactive status", () => {
    expect(parseShopPromotionUpdate({ status: "inactive" })).toMatchObject({
      status: "inactive",
    })
    expect(parseShopPromotionUpdate({ status: "active" })).toMatchObject({
      status: "active",
    })
  })
})

describe("presentShopPromotion", () => {
  it("exposes include_shipping from target type", () => {
    expect(
      presentShopPromotion({
        id: "promo_1",
        code: "LETO10",
        application_method: { type: "percentage", value: 10, target_type: "order" },
      }).include_shipping
    ).toBe(true)
  })

  it("attaches how many times the code was used", () => {
    expect(
      presentShopPromotion(
        { id: "promo_1", code: "LETO10", application_method: {} },
        { LETO10: 3 }
      ).used_count
    ).toBe(3)
  })
})

describe("promotion usage", () => {
  it("collects unique codes from an order", () => {
    expect(
      promotionCodesFromOrder({
        promotions: [{ code: "leto10" }],
        items: [{ adjustments: [{ code: "LETO10" }, { code: "SHIP5" }] }],
      }).sort()
    ).toEqual(["LETO10", "SHIP5"])
  })

  it("counts one application per order", () => {
    expect(
      tallyPromotionUses([["LETO10"], ["LETO10", "SHIP5"], ["leto10"]])
    ).toEqual({ LETO10: 3, SHIP5: 1 })
  })

  it("labels application counts in Russian", () => {
    expect(promotionUsesLabel(1)).toBe("1 применение")
    expect(promotionUsesLabel(2)).toBe("2 применения")
    expect(promotionUsesLabel(5)).toBe("5 применений")
  })
})

describe("promotionDiscountAmount", () => {
  const base = { items: 1000, shipping: 350 }

  it("applies a percentage only to goods", () => {
    expect(
      promotionDiscountAmount(
        { type: "percentage", value: 10, target_type: "items" },
        base
      )
    ).toBe(100)
  })

  it("applies a percentage to goods plus delivery", () => {
    expect(
      promotionDiscountAmount(
        { type: "percentage", value: 10, target_type: "order" },
        base
      )
    ).toBe(135)
  })
})
