import {
  applyShopGroupCoverImages,
  mergeShopCollectionCoverMetadata,
  parseShopCollectionCover,
  readShopCollectionCover,
} from "../shop-collection-cover"

describe("shop collection cover", () => {
  const photos = [
    { product_id: "p1", src: "https://img/1.jpg" },
    { product_id: "p2", src: "https://img/2.jpg" },
    { product_id: "p3", src: "https://img/3.jpg" },
  ]

  it("reads a custom photo over a product id", () => {
    expect(
      readShopCollectionCover({
        shop_cover_image_url: "https://img/cover.jpg",
        shop_cover_product_id: "p2",
      })
    ).toEqual({
      image_url: "https://img/cover.jpg",
      product_id: null,
    })
  })

  it("puts the chosen product first", () => {
    expect(
      applyShopGroupCoverImages(photos, {
        product_id: "p3",
        image_url: null,
      })
    ).toEqual([
      "https://img/3.jpg",
      "https://img/1.jpg",
      "https://img/2.jpg",
    ])
  })

  it("puts a custom photo first", () => {
    expect(
      applyShopGroupCoverImages(photos, {
        product_id: null,
        image_url: "https://img/own.jpg",
      })
    ).toEqual([
      "https://img/own.jpg",
      "https://img/1.jpg",
      "https://img/2.jpg",
      "https://img/3.jpg",
    ])
  })

  it("parses exclusive cover input", () => {
    expect(parseShopCollectionCover({ product_id: "p2" })).toEqual({
      product_id: "p2",
      image_url: null,
    })
    expect(parseShopCollectionCover({ image_url: " https://img/x.jpg " })).toEqual({
      product_id: null,
      image_url: "https://img/x.jpg",
    })
    expect(parseShopCollectionCover({ clear: true })).toEqual({
      product_id: null,
      image_url: null,
    })
    expect(parseShopCollectionCover({})).toEqual({
      error: "Укажите товар или фото",
    })
  })

  it("clears cover keys without dropping other metadata", () => {
    expect(
      mergeShopCollectionCoverMetadata(
        { delegat_group_id: "g1", shop_cover_product_id: "p2" },
        { product_id: null, image_url: null }
      )
    ).toEqual({ delegat_group_id: "g1" })
  })
})
