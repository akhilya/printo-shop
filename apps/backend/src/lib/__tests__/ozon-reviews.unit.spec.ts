import {
  collectSkuOffers,
  importOzonReviews,
  ozonReviewExternalId,
  ozonReviewPageUrl,
  parseOzonReviewInfoPhotos,
  parseOzonReviewList,
  parsePublicOzonReviewCards,
  pickPinnedReviewIds,
  shouldImportOzonReview,
} from "../ozon-reviews"

describe("shouldImportOzonReview", () => {
  it("keeps only 4–5 star reviews that have text or photos", () => {
    expect(
      shouldImportOzonReview({ rating: 5, text: "Отлично", photos_amount: 0 })
    ).toBe(true)
    expect(
      shouldImportOzonReview({ rating: 4, text: "", photos_amount: 2 })
    ).toBe(true)
    expect(
      shouldImportOzonReview({ rating: 3, text: "Так себе", photos_amount: 4 })
    ).toBe(false)
    expect(
      shouldImportOzonReview({ rating: 5, text: "  ", photos_amount: 0 })
    ).toBe(false)
  })
})

describe("parseOzonReviewList", () => {
  it("reads paging and review fields from the seller payload", () => {
    const parsed = parseOzonReviewList({
      has_next: true,
      last_id: "cursor-2",
      reviews: [
        {
          id: "rev-ozon-1",
          sku: 111,
          rating: 5,
          text: "Красивая фигура",
          photos_amount: 1,
          published_at: "2026-01-02T10:00:00Z",
        },
      ],
    })
    expect(parsed.hasNext).toBe(true)
    expect(parsed.lastId).toBe("cursor-2")
    expect(parsed.reviews[0]).toMatchObject({
      id: "rev-ozon-1",
      sku: 111,
      rating: 5,
      text: "Красивая фигура",
      photos_amount: 1,
    })
  })
})

describe("parseOzonReviewInfoPhotos", () => {
  it("collects photo urls", () => {
    expect(
      parseOzonReviewInfoPhotos({
        photos: [
          { url: "https://cdn.ozon/a.jpg" },
          { url: "https://cdn.ozon/b.jpg" },
        ],
      })
    ).toEqual(["https://cdn.ozon/a.jpg", "https://cdn.ozon/b.jpg"])
  })
})

describe("parsePublicOzonReviewCards", () => {
  it("reads the buyer name and keeps a review page link", () => {
    const cards = parsePublicOzonReviewCards({
      widgetStates: {
        reviews: JSON.stringify({
          reviews: [
            {
              uuid: "keep",
              author: { firstName: "Мария", lastName: "К." },
              sharing: { url: "https://www.ozon.ru/product/1/reviews/?ruuid=keep" },
            },
          ],
        }),
      },
    })
    expect(cards).toEqual([
      {
        id: "keep",
        author: "Мария К.",
        url: "https://www.ozon.ru/product/1/reviews/?ruuid=keep",
      },
    ])
    expect(ozonReviewPageUrl(111, "keep")).toBe(
      "https://www.ozon.ru/product/111/reviews/?ruuid=keep"
    )
  })
})

describe("pickPinnedReviewIds", () => {
  it("pins the 5-star review with the most photos, then the longest text", () => {
    expect(
      pickPinnedReviewIds([
        { id: "short", productId: "p1", rating: 5, photos: 1, textLength: 4 },
        { id: "long", productId: "p1", rating: 5, photos: 1, textLength: 40 },
        { id: "photos", productId: "p1", rating: 5, photos: 3, textLength: 2 },
        { id: "four", productId: "p1", rating: 4, photos: 9, textLength: 90 },
      ])
    ).toEqual(["photos"])
  })
})

describe("collectSkuOffers", () => {
  it("maps Ozon sku to seller offer_id", () => {
    const map = collectSkuOffers({
      items: [{ sku: 111, offer_id: "WA63" }],
    })
    expect(map.get(111)).toBe("WA63")
  })
})

describe("importOzonReviews", () => {
  it("publishes matching 4–5 star reviews with photos and skips the rest", async () => {
    const created: unknown[] = []
    const updated: unknown[] = []
    const pinned: string[] = []
    const posts: Array<{ path: string; body: Record<string, unknown> }> = []
    const result = await importOzonReviews(
      {
        sellerPost: async (path, body) => {
          posts.push({ path, body })
          if (path === "/v1/review/list") {
            return {
              has_next: false,
              reviews: [
                {
                  id: "keep",
                  sku: 111,
                  rating: 5,
                  text: "Супер",
                  photos_amount: 1,
                },
                {
                  id: "low",
                  sku: 111,
                  rating: 2,
                  text: "Плохо",
                  photos_amount: 3,
                },
                {
                  id: "dup",
                  sku: 222,
                  rating: 5,
                  text: "Уже есть",
                  photos_amount: 0,
                },
                {
                  id: "orphan",
                  sku: 999,
                  rating: 5,
                  text: "Нет в магазине",
                  photos_amount: 0,
                },
              ],
            }
          }
          if (path === "/v1/review/info") {
            return { photos: [{ url: "https://cdn.ozon/keep.jpg" }] }
          }
          if (path === "/v3/product/info/list") {
            return {
              items: [
                { sku: 111, offer_id: "WA63" },
                { sku: 222, offer_id: "GE1" },
                { sku: 999, offer_id: "MISSING" },
              ],
            }
          }
          throw new Error(path)
        },
        listExistingExternalIds: async () =>
          new Map([
            [
              ozonReviewExternalId("dup"),
              {
                id: "rev_dup",
                author: "Анна",
                source_url: "https://ozon/dup",
                product_id: "prod_ge1",
                image_urls: [],
              },
            ],
          ]),
        publicReviews: async () => [
          { id: "keep", author: "Мария К.", url: "https://www.ozon.ru/reviews/keep" },
        ],
        productIdByOffer: async () =>
          new Map([
            ["WA63", "prod_wa63"],
            ["GE1", "prod_ge1"],
          ]),
        download: async (url) => Buffer.from(url),
        storeImage: async (bytes) => `https://api.example/static/${bytes.length}.webp`,
        createReview: async (row) => {
          created.push(row)
          return { id: "rev_keep" }
        },
        updateReview: async (id, patch) => {
          updated.push({ id, ...patch })
        },
        pinReviews: async (_productId, reviewId) => {
          pinned.push(reviewId)
        },
      }
    )

    expect(result).toEqual({
      imported: 1,
      updated: 1,
      skipped_rating: 1,
      skipped_existing: 0,
      skipped_product: 1,
      skipped_empty: 0,
    })
    expect(created).toHaveLength(1)
    expect(updated).toEqual([
      expect.objectContaining({
        id: "rev_dup",
        product_id: "prod_ge1",
        body: "Уже есть",
        external_id: "ozon:dup",
      }),
    ])
    expect(created[0]).toMatchObject({
      product_id: "prod_wa63",
      author: "Мария К.",
      body: "Супер",
      source_url: "https://www.ozon.ru/reviews/keep",
      rating: 5,
      status: "published",
      enabled: true,
      external_id: "ozon:keep",
      image_url: "https://api.example/static/25.webp",
    })
    expect(pinned.sort()).toEqual(["rev_dup", "rev_keep"])
  })
})
