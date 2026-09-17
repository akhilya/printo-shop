import {
  parseShopPromotionCreate,
  parseShopPromotionUpdate,
  presentShopPromotion,
  promotionDiscountAmount,
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
