import {
  normalizeShopOrderContact,
  shopOrderContactMatches,
} from "../shop-order-access"

describe("normalizeShopOrderContact", () => {
  it("normalizes email addresses without changing their meaning", () => {
    expect(normalizeShopOrderContact("  CUSTOMER@Example.RU ")).toEqual({
      type: "email",
      value: "customer@example.ru",
    })
  })

  it("normalizes Russian phone formats consistently", () => {
    expect(normalizeShopOrderContact("8 (999) 123-45-67")).toEqual({
      type: "phone",
      value: "79991234567",
    })
    expect(normalizeShopOrderContact("+7 999 123 45 67")).toEqual({
      type: "phone",
      value: "79991234567",
    })
  })

  it("rejects malformed or overly long contacts", () => {
    expect(normalizeShopOrderContact("not a contact")).toBeNull()
    expect(normalizeShopOrderContact("customer@example")).toBeNull()
    expect(normalizeShopOrderContact("x".repeat(255))).toBeNull()
  })
})

describe("shopOrderContactMatches", () => {
  it("matches only an email or phone saved on the order", () => {
    const contacts = ["customer@example.ru", "+7 999 123 45 67"]

    expect(shopOrderContactMatches("CUSTOMER@example.ru", contacts)).toBe(true)
    expect(shopOrderContactMatches("8 999 123-45-67", contacts)).toBe(true)
    expect(shopOrderContactMatches("other@example.ru", contacts)).toBe(false)
    expect(shopOrderContactMatches("8 999 000-00-00", contacts)).toBe(false)
    expect(shopOrderContactMatches("", contacts)).toBe(false)
  })
})
