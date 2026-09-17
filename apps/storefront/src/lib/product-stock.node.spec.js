import { describe, it } from "node:test"
import assert from "node:assert/strict"
import {
  OUT_OF_STOCK_LABEL,
  productInStock,
  variantInStock,
} from "./product-stock.js"

describe("variantInStock", () => {
  it("treats untracked inventory as available", () => {
    assert.equal(variantInStock({ manage_inventory: false, inventory_quantity: 0 }), true)
  })

  it("treats a zero tracked quantity as out of stock", () => {
    assert.equal(variantInStock({ manage_inventory: true, inventory_quantity: 0 }), false)
    assert.equal(variantInStock({ inventory_quantity: 0 }), false)
  })

  it("treats a positive quantity as in stock", () => {
    assert.equal(variantInStock({ inventory_quantity: 2 }), true)
  })
})

describe("productInStock", () => {
  it("is out of stock when every variant is empty", () => {
    assert.equal(
      productInStock({
        variants: [
          { inventory_quantity: 0 },
          { manage_inventory: true, inventory_quantity: 0 },
        ],
      }),
      false
    )
  })

  it("is in stock when any variant has quantity", () => {
    assert.equal(
      productInStock({
        variants: [{ inventory_quantity: 0 }, { inventory_quantity: 1 }],
      }),
      true
    )
  })
})

describe("OUT_OF_STOCK_LABEL", () => {
  it("uses the shopper-facing copy", () => {
    assert.equal(OUT_OF_STOCK_LABEL, "Нету в наличии")
  })
})
