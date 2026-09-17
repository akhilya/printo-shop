import { describe, it } from "node:test"
import assert from "node:assert/strict"
import {
  isCartAlreadyCompletedError,
  isCompletedCart,
} from "./checkout-success.js"

describe("isCartAlreadyCompletedError", () => {
  it("recognizes the Medusa complete-cart payload", () => {
    assert.equal(
      isCartAlreadyCompletedError({
        type: "invalid_data",
        message: "Cart cart_01M2QRWF9HJFYNWAR64K0HZ5NY is already completed.",
      }),
      true
    )
  })

  it("recognizes a nested SDK error", () => {
    assert.equal(
      isCartAlreadyCompletedError({
        type: "cart",
        error: {
          message: "Cart cart_1 is already completed.",
        },
      }),
      true
    )
  })

  it("ignores a pending payment", () => {
    assert.equal(
      isCartAlreadyCompletedError({
        message: "Оплата не подтверждена банком",
      }),
      false
    )
  })
})

describe("isCompletedCart", () => {
  it("is true when Medusa already placed the order", () => {
    assert.equal(
      isCompletedCart({ completed_at: "2026-09-17T16:40:00.000Z" }),
      true
    )
    assert.equal(isCompletedCart({ id: "cart_1" }), false)
  })
})
