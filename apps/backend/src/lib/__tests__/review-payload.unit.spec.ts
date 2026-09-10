import {
  MAX_REVIEW_IMAGES,
  parseReviewInput,
  parseReviewStatus,
  presentReview,
} from "../review-payload"

describe("parseReviewInput", () => {
  const base = {
    product_id: "prod_1",
    author: "Анна",
    body: "Хорошая фигура",
    rating: 5,
  }

  it("requires name, text, and a star rating", () => {
    expect(parseReviewInput({ ...base, author: "" })).toEqual({
      error: "Введите имя и текст отзыва",
    })
    expect(parseReviewInput({ ...base, rating: 0 })).toEqual({
      error: "Поставьте оценку от 1 до 5",
    })
  })

  it("collects several photos and keeps the legacy single image", () => {
    const parsed = parseReviewInput({
      ...base,
      images: [{ content: "data:image/png;base64,aaa" }, { content: "data:image/png;base64,bbb" }],
    })
    expect("error" in parsed).toBe(false)
    if ("error" in parsed) return
    expect(parsed.images).toHaveLength(2)
    expect(parsed.rating).toBe(5)

    const legacy = parseReviewInput({
      ...base,
      image: { content: "data:image/png;base64,ccc" },
    })
    expect("error" in legacy).toBe(false)
    if ("error" in legacy) return
    expect(legacy.images).toEqual(["data:image/png;base64,ccc"])
  })

  it("caps the number of photos", () => {
    const images = Array.from({ length: MAX_REVIEW_IMAGES + 1 }, () => ({
      content: "data:image/png;base64,x",
    }))
    expect(parseReviewInput({ ...base, images })).toEqual({
      error: `Можно прикрепить не больше ${MAX_REVIEW_IMAGES} фото`,
    })
  })

  it("presents a review with several photos", () => {
    const presented = presentReview({
      id: "rev_1",
      product_id: "prod_1",
      author: "Анна",
      body: "Хорошо",
      rating: 5,
      image_urls: ["https://cdn/a.webp", "https://cdn/b.webp"],
      created_at: "2026-09-10T12:00:00.000Z",
    })
    expect(presented.image_urls).toEqual([
      "https://cdn/a.webp",
      "https://cdn/b.webp",
    ])
    expect(presented.image_url).toBe("https://cdn/a.webp")
    expect(presented.rating).toBe(5)
    expect(presented.status).toBe("published")
  })

  it("maps review moderation status", () => {
    expect(presentReview({ id: "rev_1", status: "moderation" }).status).toBe(
      "moderation"
    )
    expect(presentReview({ id: "rev_1", enabled: false }).status).toBe(
      "moderation"
    )
    expect(parseReviewStatus({ status: "published" })).toBe("published")
    expect(parseReviewStatus({ enabled: false })).toBe("moderation")
    expect(parseReviewStatus({})).toEqual({ error: "Неизвестный статус" })
  })

  it("hides ip from the store payload", () => {
    expect(
      presentReview({ id: "rev_1", ip: "1.2.3.4" }).ip
    ).toBeUndefined()
    expect(
      presentReview({ id: "rev_1", ip: "1.2.3.4" }, { includeIp: true }).ip
    ).toBe("1.2.3.4")
  })
})
