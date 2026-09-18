import {
  applyInventoryItemQuantities,
  catalogProductInStock,
  pageCatalogIds,
  pickLuckyCatalogRow,
  productMatchesCatalogQuery,
  sortCatalogByAvailability,
} from "../shop-catalog"

const inStock = {
  id: "a",
  title: "Страж",
  handle: "strazh",
  variants: [{ sku: "WA150", inventory_quantity: 2 }],
}
const empty = {
  id: "b",
  title: "Тень",
  handle: "ten",
  variants: [{ sku: "TN1", inventory_quantity: 0 }],
}

describe("shop catalog", () => {
  it("matches title, handle, and sku", () => {
    expect(productMatchesCatalogQuery(inStock, "страж")).toBe(true)
    expect(productMatchesCatalogQuery(inStock, "wa150")).toBe(true)
    expect(productMatchesCatalogQuery(inStock, "tn1")).toBe(false)
  })

  it("puts out-of-stock rows after in-stock ones across the whole list", () => {
    const sorted = sortCatalogByAvailability([empty, inStock, { ...empty, id: "c" }])
    expect(sorted.map((row) => row.id)).toEqual(["a", "b", "c"])
    expect(catalogProductInStock(empty)).toBe(false)
    expect(pageCatalogIds(sorted, 1, 1)).toEqual({ ids: ["b"], count: 3 })
  })

  it("picks a lucky in-stock product and can exclude the current one", () => {
    const picked = pickLuckyCatalogRow([inStock, empty], "a")
    expect(picked?.id).toBe("b")
    expect(pickLuckyCatalogRow([inStock], "a")).toBeNull()
  })

  it("reads stock from location levels when inventory_quantity is missing", () => {
    const row = {
      id: "d",
      variants: [
        {
          id: "var_1",
          inventory_items: [
            {
              required_quantity: 1,
              inventory: {
                location_levels: [{ stocked_quantity: 8, reserved_quantity: 1 }],
              },
            },
          ],
        },
      ],
    }
    expect(catalogProductInStock(row)).toBe(true)
    expect(
      catalogProductInStock({
        id: "e",
        variants: [
          {
            inventory_items: [
              { inventory: { location_levels: [{ stocked_quantity: 0 }] } },
            ],
          },
        ],
      })
    ).toBe(false)
  })

  it("applies inventory item quantities onto variants", () => {
    const rows = [
      {
        id: "f",
        variants: [
          { id: "v1", inventory_items: [{ inventory_item_id: "item_1" }] },
        ],
      },
    ]
    applyInventoryItemQuantities(rows, { item_1: 5 })
    expect(catalogProductInStock(rows[0])).toBe(true)
  })
})
