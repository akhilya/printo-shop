import {
  applyInventoryItemQuantities,
  applyVariantPrices,
  attachVariantInventoryLinks,
  catalogProductInStock,
  pageCatalogIds,
  pageCatalogProducts,
  pickLuckyCatalogRow,
  pickLuckyCatalogRows,
  presentCatalogProduct,
  productMatchesCatalogQuery,
  projectProductListRows,
  randomCatalogSkip,
  slimCatalogMetadata,
  sortCatalogByAvailability,
  canPreviewInStockPage,
  catalogUsesMemory,
  presentShopGroups,
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
    const many = pickLuckyCatalogRows(
      [
        inStock,
        { ...inStock, id: "c" },
        { ...inStock, id: "d" },
        empty,
      ],
      3,
      "b"
    )
    expect(many.map((row) => row.id).sort()).toEqual(["a", "c", "d"])
    expect(pickLuckyCatalogRows([inStock], 3)).toHaveLength(1)
    expect(randomCatalogSkip(10, () => 0)).toBe(0)
    expect(randomCatalogSkip(10, () => 0.999)).toBe(9)
    expect(randomCatalogSkip(0)).toBe(0)
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

  it("returns storefront products without listing ids", () => {
    const page = pageCatalogProducts(
      [
        {
          id: "a",
          title: "Страж",
          handle: "strazh",
          thumbnail: "https://img/a.jpg",
          metadata: { price: "1500", old_price: "2000", attributes: "{}" },
          images: [{ url: "https://img/a.jpg" }],
          variants: [
            {
              id: "v1",
              sku: "WA150",
              manage_inventory: true,
              inventory_quantity: 2,
            },
          ],
        },
      ],
      0,
      20
    )
    expect(page.count).toBe(1)
    expect(page.products).toHaveLength(1)
    expect(page.products[0]).toMatchObject({
      id: "a",
      handle: "strazh",
      variants: [
        {
          sku: "WA150",
          calculated_price: {
            calculated_amount: 1500,
            original_amount: 2000,
            currency_code: "rub",
          },
        },
      ],
    })
    expect(presentCatalogProduct({ id: "z" }).variants).toEqual([])
  })

  it("gives lucky the same card payload as the catalog", () => {
    const row = {
      id: "a",
      title: "Страж",
      handle: "strazh",
      thumbnail: "https://img/a.webp",
      metadata: { price: "1500" },
      variants: [
        {
          id: "v1",
          sku: "WA150",
          manage_inventory: true,
          inventory_quantity: 2,
        },
      ],
    }
    expect(presentCatalogProduct(row)).toMatchObject({
      id: "a",
      handle: "strazh",
      thumbnail: "https://img/a.webp",
      variants: [
        {
          calculated_price: {
            calculated_amount: 1500,
            currency_code: "rub",
          },
        },
      ],
    })
  })

  it("shows the selling price, not a leftover sale price", () => {
    const card = presentCatalogProduct({
      id: "a",
      title: "Удзумэ",
      handle: "uzume",
      metadata: { price: "2100", sale_price: "315", old_price: "2600" },
      variants: [
        {
          id: "v1",
          metadata: { old_price: "2600" },
        },
      ],
    })
    expect(card.variants[0].calculated_price).toMatchObject({
      calculated_amount: 2100,
      original_amount: 2600,
    })
  })

  it("prefers the live variant price over metadata", () => {
    const rows = applyVariantPrices(
      [
        {
          id: "a",
          variants: [{ id: "v1" }],
          metadata: { price: "2100", sale_price: "315" },
        },
      ],
      { v1: 2500 }
    )
    expect(presentCatalogProduct(rows[0]).variants[0].calculated_price).toMatchObject({
      calculated_amount: 2500,
    })
    expect(
      presentCatalogProduct({
        id: "b",
        metadata: { price: "2100" },
        variants: [{ id: "v2", amount: null }],
      }).variants[0].calculated_price
    ).toMatchObject({ calculated_amount: 2100 })
  })

  it("keeps only listing metadata on catalog cards", () => {
    expect(
      slimCatalogMetadata({
        price: "1500",
        specs: "[]",
        image_keys: "[1,2,3]",
        delegat_product_id: "9",
        attributes: "{}",
      })
    ).toEqual({ price: "1500", attributes: "{}" })
  })

  it("serves a ready catalog from memory and a cold one as a page", () => {
    expect(catalogUsesMemory({ count: 20, partial: false })).toBe(true)
    expect(catalogUsesMemory({ count: 20, partial: true })).toBe(false)
    expect(catalogUsesMemory({ count: 0, partial: false })).toBe(false)
  })

  it("uses a short in-stock preview for the home rail", () => {
    expect(
      canPreviewInStockPage({ in_stock: true, limit: 16, offset: 0 })
    ).toBe(true)
    expect(
      canPreviewInStockPage({
        in_stock: true,
        collection_id: "pcol_1",
        limit: 16,
      })
    ).toBe(false)
  })

  it("builds collection cards from a product sample and cover metadata", () => {
    const groups = presentShopGroups(
      [
        {
          id: "c1",
          title: "Стражи",
          metadata: { shop_cover_image_url: "https://img/cover.webp" },
        },
        { id: "c2", title: "Пусто" },
      ],
      [{ id: "p1", collection_id: "c1", thumbnail: "https://img/p1.webp" }]
    )
    expect(groups.map((group) => group.id)).toEqual(["c1"])
    expect(groups[0].images[0]).toBe("https://img/cover.webp")
  })

  it("projects module rows without fat metadata or category payloads", () => {
    const rows = projectProductListRows([
      {
        id: "p1",
        title: "Страж",
        handle: "strazh",
        metadata: {
          price: "1500",
          specs: "[]",
          image_keys: "[1,2,3]",
          delegat_product_id: "9",
        },
        categories: [{ id: "c1" }],
        variants: [
          {
            id: "v1",
            sku: "WA150",
            manage_inventory: true,
            metadata: { old_price: "2000", extra: "nope" },
          },
        ],
      },
    ])
    expect(rows[0].metadata).toEqual({ price: "1500" })
    expect(rows[0].categories).toEqual([{ id: "c1" }])
    expect(rows[0].variants?.[0].metadata).toEqual({ old_price: "2000" })
  })

  it("attaches inventory links by variant id then applies quantities", () => {
    const rows = projectProductListRows([
      {
        id: "p1",
        variants: [{ id: "v1", manage_inventory: true }],
      },
    ])
    attachVariantInventoryLinks(rows, [
      { variant_id: "v1", inventory_item_id: "item_1", required_quantity: 1 },
    ])
    applyInventoryItemQuantities(rows, { item_1: 4 })
    expect(catalogProductInStock(rows[0])).toBe(true)
    expect(rows[0].variants?.[0].inventory_quantity).toBe(4)
  })
})
