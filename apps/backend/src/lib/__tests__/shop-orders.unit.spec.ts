import { isOrderWritePath } from "../shop-orders"

describe("isOrderWritePath", () => {
  it("blocks cart complete and payment", () => {
    expect(
      isOrderWritePath("POST", "/store/carts/cart_1/complete")
    ).toBe(true)
    expect(
      isOrderWritePath("POST", "/store/payment-collections")
    ).toBe(true)
    expect(
      isOrderWritePath("POST", "/store/custom-orders")
    ).toBe(true)
    expect(
      isOrderWritePath("POST", "/store/custom-checkout/tok_1/pay")
    ).toBe(true)
  })

  it("allows browsing and cart edits", () => {
    expect(isOrderWritePath("GET", "/store/products")).toBe(false)
    expect(isOrderWritePath("GET", "/store/custom-checkout/tok_1")).toBe(false)
    expect(isOrderWritePath("POST", "/store/carts")).toBe(false)
    expect(isOrderWritePath("POST", "/store/carts/cart_1/line-items")).toBe(
      false
    )
  })
})
