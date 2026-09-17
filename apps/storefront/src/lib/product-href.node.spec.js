import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { productHref } from "./product-href.js"

describe("productHref", () => {
  it("builds a product url from nested handles", () => {
    assert.equal(productHref({ product_handle: "orc" }), "/p/orc")
    assert.equal(productHref({ variant: { product: { handle: "elf" } } }), "/p/elf")
    assert.equal(productHref({ product: { handle: "dwarf" } }), "/p/dwarf")
    assert.equal(productHref({ title: "Фигурка" }), "")
  })
})
