import {
  parseShopPromotionCreate,
  parseShopPromotionUpdate,
  presentPublicPromo,
  presentShopPromotion,
  promotionPageFromRow,
  promotionPageKey,
  promotionCodesFromOrder,
  promotionDiscountAmount,
  promotionIsExhausted,
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
      limit: null,
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

  it("treats 0 max uses as unlimited and keeps a positive cap", () => {
    expect(
      parseShopPromotionCreate({
        code: "FIG10",
        type: "fixed",
        value: 150,
        max_uses: 0,
      })
    ).toMatchObject({ limit: null })
    expect(
      parseShopPromotionCreate({
        code: "FIG10",
        type: "fixed",
        value: 150,
        max_uses: 20,
      })
    ).toMatchObject({ limit: 20 })
    expect(
      parseShopPromotionCreate({
        code: "FIG10",
        type: "fixed",
        value: 150,
        max_uses: -1,
      })
    ).toEqual({ error: "Укажите число применений" })
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
        { id: "promo_1", code: "LETO10", limit: 5, application_method: {} },
        { LETO10: 3 }
      )
    ).toMatchObject({ used_count: 3, max_uses: 5 })
  })
})

describe("promotion page", () => {
  it("generates an address that is not the promo code", () => {
    const created = parseShopPromotionCreate({
      code: "LETO10",
      type: "percentage",
      value: 10,
    })
    if ("error" in created) throw new Error(created.error)
    expect(created.metadata?.page).toMatch(/^[a-z0-9]{10}$/)
    expect(created.metadata?.page).not.toBe("leto10")
    expect(promotionPageKey("LETO10")).not.toBe("leto10")
  })

  it("hides a page address that repeats the code", () => {
    expect(
      promotionPageFromRow({
        code: "summer2024",
        metadata: { page: "summer2024" },
      })
    ).toBe("")
    expect(
      promotionPageFromRow({
        code: "LETO10",
        metadata: { page: "k7m2qx9pab" },
      })
    ).toBe("k7m2qx9pab")
  })
})

describe("presentPublicPromo", () => {
  const row = {
    code: "leto10",
    status: "active",
    is_automatic: false,
    limit: 5,
    application_method: {
      type: "percentage",
      value: 10,
      target_type: "items",
    },
  }

  it("shows an active code for the storefront", () => {
    expect(presentPublicPromo(row, 1)).toEqual({
      ended: false,
      code: "LETO10",
      type: "percentage",
      value: 10,
      include_shipping: false,
    })
  })

  it("hides automatic, inactive, and exhausted promotions", () => {
    expect(presentPublicPromo({ ...row, is_automatic: true }, 0)).toBeNull()
    expect(presentPublicPromo({ ...row, status: "inactive" }, 0)).toBeNull()
    expect(presentPublicPromo(row, 5)).toEqual({ ended: true })
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

  it("labels application counts as used over max", () => {
    expect(promotionUsesLabel(0, 5)).toBe("0/5")
    expect(promotionUsesLabel(8, 20)).toBe("8/20")
    expect(promotionUsesLabel(20, 20)).toBe("20/20")
    expect(promotionUsesLabel(8, 0)).toBe("8/0")
    expect(promotionIsExhausted(20, 20)).toBe(true)
    expect(promotionIsExhausted(8, 0)).toBe(false)
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
