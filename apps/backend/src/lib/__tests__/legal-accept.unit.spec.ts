import { parseCustomCheckoutPay } from "../custom-order-pay"
import { hasLegalAccepted, LEGAL_ACCEPT_ERROR } from "../legal-accept"

describe("hasLegalAccepted", () => {
  it("accepts only an explicit yes", () => {
    expect(hasLegalAccepted(true)).toBe(true)
    expect(hasLegalAccepted("true")).toBe(true)
    expect(hasLegalAccepted(false)).toBe(false)
    expect(hasLegalAccepted(undefined)).toBe(false)
  })
})

describe("parseCustomCheckoutPay", () => {
  it("refuses pay without legal consent", () => {
    expect(
      parseCustomCheckoutPay({
        email: "a@test.ru",
        phone: "+7999",
      })
    ).toEqual({ error: LEGAL_ACCEPT_ERROR })
  })

  it("passes when the buyer accepted", () => {
    const parsed = parseCustomCheckoutPay({
      email: "a@test.ru",
      legal_accepted: true,
    })
    expect("error" in parsed).toBe(false)
    if ("error" in parsed) return
    expect(parsed.legal_accepted).toBe(true)
  })
})
