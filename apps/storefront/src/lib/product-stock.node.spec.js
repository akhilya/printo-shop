import { describe, it } from "node:test"
import assert from "node:assert/strict"
import {
  OUT_OF_STOCK_LABEL,
  productInStock,
  shuffleInStockFirst,
  sortInStockFirst,
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

describe("sortInStockFirst", () => {
  it("keeps in-stock cards before empty ones", () => {
    const empty = { id: "a", variants: [{ inventory_quantity: 0 }] }
    const stocked = { id: "b", variants: [{ inventory_quantity: 1 }] }
    const alsoEmpty = { id: "c", variants: [{ inventory_quantity: 0 }] }
    assert.deepEqual(
      sortInStockFirst([empty, stocked, alsoEmpty]).map((item) => item.id),
      ["b", "a", "c"]
    )
  })

  it("shuffles within stock groups and keeps empty last", () => {
    const mixed = shuffleInStockFirst([
      { id: "a", variants: [{ inventory_quantity: 0 }] },
      { id: "b", variants: [{ inventory_quantity: 1 }] },
      { id: "c", variants: [{ inventory_quantity: 2 }] },
    ])
    const ids = mixed.map((item) => item.id)
    assert.equal(ids.includes("a"), true)
    assert.equal(ids[ids.length - 1], "a")
  })
})

describe("OUT_OF_STOCK_LABEL", () => {
  it("uses the shopper-facing copy", () => {
    assert.equal(OUT_OF_STOCK_LABEL, "Нету в наличии")
  })
})
