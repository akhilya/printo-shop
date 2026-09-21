export const MAX_REVIEW_IMAGES = 6
export const MIN_RATING = 1
export const MAX_RATING = 5

export type ParsedReviewInput = {
  productId: string
  author: string
  text: string
  rating: number
  images: string[]
}

export function parseReviewInput(
  body: unknown
): ParsedReviewInput | { error: string } {
  const rec =
    body && typeof body === "object" ? (body as Record<string, unknown>) : {}
  const productId = String(rec.product_id || "").trim()
  const author = String(rec.author || "").trim()
  const text = String(rec.body || "").trim()
  if (!productId || !author || !text) {
    return { error: "Введите имя и текст отзыва" }
  }

  const rating = Number(rec.rating)
  if (!Number.isInteger(rating) || rating < MIN_RATING || rating > MAX_RATING) {
    return { error: "Поставьте оценку от 1 до 5" }
  }

  const images: string[] = []
  const list = Array.isArray(rec.images) ? rec.images : []
  for (const item of list) {
    const content =
      item && typeof item === "object"
        ? (item as { content?: unknown }).content
        : null
    if (typeof content === "string" && content.trim()) {
      images.push(content)
    }
  }
  if (
    !images.length &&
    rec.image &&
    typeof rec.image === "object"
  ) {
    const content = (rec.image as { content?: unknown }).content
    if (typeof content === "string" && content.trim()) {
      images.push(content)
    }
  }
  if (images.length > MAX_REVIEW_IMAGES) {
    return { error: `Можно прикрепить не больше ${MAX_REVIEW_IMAGES} фото` }
  }

  return { productId, author, text, rating, images }
}

export function reviewImageList(review: {
  image_url?: string | null
  image_urls?: unknown
}): string[] {
  if (Array.isArray(review.image_urls)) {
    return review.image_urls.filter(
      (url): url is string => typeof url === "string" && Boolean(url)
    )
  }
  if (review.image_url) return [review.image_url]
  return []
}

export const REVIEW_STATUSES = ["moderation", "published"] as const
export type ReviewStatus = (typeof REVIEW_STATUSES)[number]

export type PresentedReview = {
  id: string
  product_id: string
  author: string
  body: string
  rating: number | null
  image_url: string | null
  image_urls: string[]
  status: ReviewStatus
  source_url?: string | null
  pinned?: boolean
  ip?: string | null
  created_at?: string
  updated_at?: string
  product?: {
    id: string
    title: string
    handle: string | null
    thumbnail: string | null
  } | null
}

export function parseReviewStatus(body: unknown): ReviewStatus | { error: string } {
  const rec =
    body && typeof body === "object" ? (body as Record<string, unknown>) : {}
  if (typeof rec.enabled === "boolean") {
    return rec.enabled ? "published" : "moderation"
  }
  const status = String(rec.status || "").trim()
  if (!REVIEW_STATUSES.includes(status as ReviewStatus)) {
    return { error: "Неизвестный статус" }
  }
  return status as ReviewStatus
}

export function reviewStatusOf(review: Record<string, unknown>): ReviewStatus {
  if (review.status === "published") return "published"
  if (review.status === "moderation") return "moderation"
  return review.enabled === false ? "moderation" : "published"
}

export function presentReview(
  review: Record<string, unknown>,
  opts: { includeIp?: boolean } = {}
): PresentedReview {
  const imageUrls = reviewImageList({
    image_url: typeof review.image_url === "string" ? review.image_url : null,
    image_urls: review.image_urls,
  })
  const status = reviewStatusOf(review)
  return {
    id: String(review.id || ""),
    product_id: String(review.product_id || ""),
    author: String(review.author || ""),
    body: String(review.body || ""),
    rating: typeof review.rating === "number" ? review.rating : null,
    image_url: imageUrls[0] || null,
    image_urls: imageUrls,
    status,
    source_url:
      typeof review.source_url === "string" && review.source_url
        ? review.source_url
        : null,
    pinned: review.pinned === true,
    ip: opts.includeIp
      ? review.ip
        ? String(review.ip)
        : null
      : undefined,
    created_at: review.created_at ? String(review.created_at) : undefined,
    updated_at: review.updated_at ? String(review.updated_at) : undefined,
  }
}
