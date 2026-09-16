import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { cartLineForVariant } from "./cart-line.js"

describe("cartLineForVariant", () => {
  it("finds the cart line for the selected variant", () => {
    const line = cartLineForVariant(
      {
        items: [
          { id: "li_other", variant_id: "var_1", quantity: 1 },
          { id: "li_match", variant_id: "var_2", quantity: 3 },
        ],
      },
      "var_2"
    )
    assert.equal(line?.id, "li_match")
    assert.equal(line?.quantity, 3)
  })

  it("returns null when the variant is not in the cart", () => {
    assert.equal(
      cartLineForVariant({ items: [{ id: "li_1", variant_id: "var_1" }] }, "var_2"),
      null
    )
    assert.equal(cartLineForVariant(null, "var_1"), null)
  })

  it("matches nested variant.id when variant_id is missing", () => {
    const line = cartLineForVariant(
      { items: [{ id: "li_nested", variant: { id: "var_9" }, quantity: 2 }] },
      "var_9"
    )
    assert.equal(line?.id, "li_nested")
  })
})
