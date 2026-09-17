import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { visibleCheckoutShipping } from "./checkout-shipping.js"

describe("visibleCheckoutShipping", () => {
  it("does not keep a leftover fixed cart amount in ozon mode", () => {
    assert.equal(
      visibleCheckoutShipping({
        quoteMode: "ozon",
        quoted: null,
        cartShipping: 350,
      }),
      0
    )
  })

  it("shows the live quote once Ozon returns it", () => {
    assert.equal(
      visibleCheckoutShipping({
        quoteMode: "ozon",
        quoted: 410,
        cartShipping: 350,
      }),
      410
    )
  })

  it("keeps the cart amount only in fixed mode", () => {
    assert.equal(
      visibleCheckoutShipping({
        quoteMode: "fixed",
        quoted: null,
        cartShipping: 350,
      }),
      350
    )
  })

  it("uses the shop fixed amount immediately when the cart has no shipping yet", () => {
    assert.equal(
      visibleCheckoutShipping({
        quoteMode: "fixed",
        quoted: null,
        cartShipping: 0,
        shopFixedAmount: 350,
      }),
      350
    )
  })
})
