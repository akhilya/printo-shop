import { MedusaContainer } from "@medusajs/framework"
import { MedusaError, Modules } from "@medusajs/framework/utils"
import { createHash } from "node:crypto"
import { convertToWebp, downloadUrl } from "./delegat-bridge/ingest-images-io"
import {
  ozonAdminErrorMessage,
  ozonCredsFromRow,
  ozonSellerReady,
  sellerPost,
} from "./ozon-delivery"
import { MAX_REVIEW_IMAGES } from "./review-payload"
import { getShopSetting } from "./shop-setting"
import { REVIEW_MODULE } from "../modules/reviews"
import type ReviewModuleService from "../modules/reviews/service"

export const OZON_REVIEW_AUTHOR = "Покупатель"

export type OzonReviewListItem = {
  id: string
  sku: number
  rating: number
  text: string
  photos_amount: number
  author: string
  published_at?: string
}

export type PublicOzonReviewCard = {
  id: string
  author: string
  url: string
}

export type StoredOzonReview = {
  id: string
  author: string
  source_url: string | null
  product_id: string
  image_urls: string[]
}

export type OzonReviewImportResult = {
  imported: number
  updated: number
  skipped_rating: number
  skipped_existing: number
  skipped_product: number
  skipped_empty: number
}

export type OzonReviewImportDeps = {
  sellerPost: (
    path: string,
    body: Record<string, unknown>
  ) => Promise<unknown>
  listExistingExternalIds: (ids: string[]) => Promise<Map<string, StoredOzonReview>>
  publicReviews?: (sku: number) => Promise<PublicOzonReviewCard[]>
  updateReview?: (
    id: string,
    patch: Record<string, unknown>
  ) => Promise<void>
  productIdByOffer: (offers: string[]) => Promise<Map<string, string>>
  download: (url: string) => Promise<Buffer>
  storeImage: (bytes: Buffer) => Promise<string | null>
  createReview: (row: Record<string, unknown>) => Promise<{ id?: string } | void>
  pinReviews?: (productId: string, reviewId: string) => Promise<void>
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function firstText(...values: unknown[]) {
  for (const value of values) {
    const text = String(value ?? "").trim()
    if (text) return text
  }
  return ""
}

function firstNumber(...values: unknown[]) {
  for (const value of values) {
    const num = Number(value)
    if (Number.isFinite(num) && num > 0) return num
  }
  return null
}

export function ozonReviewExternalId(id: string) {
  return `ozon:${String(id || "").trim()}`
}

export function ozonReviewAuthor(...values: unknown[]) {
  for (const value of values) {
    const rec = asRecord(value)
    const text = rec
      ? firstText(
          rec.name,
          rec.fio,
          [rec.firstName, rec.lastName].filter(Boolean).join(" "),
          rec.first_name
        )
      : firstText(value)
    const name = text.replace(/\s+/g, " ").trim()
    if (name && !/^покупатель$/i.test(name)) return name
  }
  return ""
}

export function ozonReviewPageUrl(sku: number, reviewId: string) {
  return `https://www.ozon.ru/product/${sku}/reviews/?ruuid=${encodeURIComponent(reviewId)}`
}

export type PinCandidate = {
  id: string
  productId: string
  rating: number
  photos: number
  textLength: number
}

export function pickPinnedReviewIds(rows: PinCandidate[]): string[] {
  const byProduct = new Map<string, PinCandidate[]>()
  for (const row of rows) {
    if (!row.id || !row.productId || row.rating !== 5) continue
    const list = byProduct.get(row.productId) || []
    list.push(row)
    byProduct.set(row.productId, list)
  }
  const ids: string[] = []
  for (const group of byProduct.values()) {
    group.sort(
      (a, b) => b.photos - a.photos || b.textLength - a.textLength
    )
    if (group[0]) ids.push(group[0].id)
  }
  return ids
}

export function parsePublicOzonReviewCards(raw: unknown): PublicOzonReviewCard[] {
  const found = new Map<string, PublicOzonReviewCard>()
  const stack: unknown[] = [raw]
  while (stack.length) {
    const cur = stack.pop()
    if (typeof cur === "string") {
      const text = cur.trim()
      if (
        (text.startsWith("{") && text.endsWith("}")) ||
        (text.startsWith("[") && text.endsWith("]"))
      ) {
        try {
          stack.push(JSON.parse(text))
        } catch {
          // Widget state is not always JSON.
        }
      }
      continue
    }
    if (Array.isArray(cur)) {
      for (const item of cur) stack.push(item)
      continue
    }
    const rec = asRecord(cur)
    if (!rec) continue
    const id = firstText(rec.uuid, rec.review_uuid, rec.reviewUuid, rec.ruuid)
    const author = ozonReviewAuthor(rec.author, rec.user, rec.author_name, rec.authorName)
    const sharing = asRecord(rec.sharing)
    const url = firstText(sharing?.url, rec.review_url)
    if (id && author) {
      found.set(id, {
        id,
        author,
        url: url.startsWith("http") ? url : "",
      })
    }
    for (const value of Object.values(rec)) {
      if (value && (typeof value === "object" || typeof value === "string")) {
        stack.push(value)
      }
    }
  }
  return [...found.values()]
}

export async function fetchPublicOzonReviewCards(
  sku: number
): Promise<PublicOzonReviewCard[]> {
  const page = `/product/${sku}/reviews/`
  const response = await fetch(
    `https://www.ozon.ru/api/composer-api.bx/page/json/v2?url=${encodeURIComponent(page)}`,
    {
      headers: {
        accept: "application/json",
        "user-agent": "Mozilla/5.0",
      },
    }
  )
  if (!response.ok) return []
  return parsePublicOzonReviewCards(await response.json())
}

export function shouldImportOzonReview(review: {
  rating: number
  text: string
  photos_amount: number
}) {
  if (review.rating !== 4 && review.rating !== 5) return false
  if (String(review.text || "").trim()) return true
  return Number(review.photos_amount) > 0
}

export function parseOzonReviewList(raw: unknown): {
  hasNext: boolean
  lastId: string
  reviews: OzonReviewListItem[]
} {
  const rec = asRecord(raw) || asRecord(asRecord(raw)?.result) || {}
  const rows = Array.isArray(rec.reviews) ? rec.reviews : []
  const reviews: OzonReviewListItem[] = []
  for (const row of rows) {
    const item = asRecord(row)
    if (!item) continue
    const id = firstText(item.id, item.review_id)
    const sku = firstNumber(item.sku)
    const rating = Number(item.rating)
    if (!id || sku == null || !Number.isInteger(rating)) continue
    reviews.push({
      id,
      sku,
      rating,
      text: String(item.text || item.comment || "").trim(),
      photos_amount: Number(item.photos_amount) || 0,
      author: ozonReviewAuthor(item.author, item.author_name, item.authorName),
      published_at: firstText(item.published_at, item.created_at) || undefined,
    })
  }
  return {
    hasNext: rec.has_next === true,
    lastId: firstText(rec.last_id),
    reviews,
  }
}

export function parseOzonReviewInfoPhotos(raw: unknown): string[] {
  const rec = asRecord(raw) || asRecord(asRecord(raw)?.result) || {}
  const photos = Array.isArray(rec.photos) ? rec.photos : []
  const urls: string[] = []
  for (const photo of photos) {
    const item = asRecord(photo)
    const url = firstText(item?.url, item?.full_size_url, item?.thumbnail_url)
    if (url) urls.push(url)
    if (urls.length >= MAX_REVIEW_IMAGES) break
  }
  return urls
}

export function collectSkuOffers(raw: unknown) {
  const map = new Map<number, string>()
  const stack: unknown[] = [raw]
  while (stack.length) {
    const cur = stack.pop()
    if (!cur) continue
    if (Array.isArray(cur)) {
      for (const item of cur) stack.push(item)
      continue
    }
    const rec = asRecord(cur)
    if (!rec) continue
    const offer = firstText(rec.offer_id, rec.offerId)
    const sku = firstNumber(rec.sku)
    if (offer && sku != null) map.set(sku, offer)
    for (const value of Object.values(rec)) {
      if (value && typeof value === "object") stack.push(value)
    }
  }
  return map
}

async function listOzonReviewsByStatus(
  post: OzonReviewImportDeps["sellerPost"],
  status: string
) {
  const reviews: OzonReviewListItem[] = []
  let lastId = ""
  for (let page = 0; page < 200; page++) {
    const parsed = parseOzonReviewList(
      await post("/v1/review/list", {
        last_id: lastId,
        limit: 100,
        sort_dir: "DESC",
        status,
      })
    )
    reviews.push(...parsed.reviews)
    if (!parsed.hasNext || !parsed.lastId || parsed.lastId === lastId) break
    lastId = parsed.lastId
  }
  return reviews
}

async function listAllOzonReviews(post: OzonReviewImportDeps["sellerPost"]) {
  try {
    return await listOzonReviewsByStatus(post, "ALL")
  } catch {
    const processed = await listOzonReviewsByStatus(post, "PROCESSED")
    const unprocessed = await listOzonReviewsByStatus(post, "UNPROCESSED")
    const seen = new Set<string>()
    const reviews: OzonReviewListItem[] = []
    for (const row of [...processed, ...unprocessed]) {
      if (seen.has(row.id)) continue
      seen.add(row.id)
      reviews.push(row)
    }
    return reviews
  }
}

async function sellerSkuOffers(
  post: OzonReviewImportDeps["sellerPost"],
  skus: number[]
) {
  const map = new Map<number, string>()
  const unique = [...new Set(skus.filter((sku) => sku > 0))]
  for (let i = 0; i < unique.length; i += 100) {
    const chunk = unique.slice(i, i + 100)
    const parsed = collectSkuOffers(
      await post("/v3/product/info/list", { sku: chunk })
    )
    for (const [sku, offer] of parsed) map.set(sku, offer)
  }
  return map
}

async function reviewPhotos(
  deps: OzonReviewImportDeps,
  review: OzonReviewListItem
) {
  if (review.photos_amount <= 0) return []
  const urls = parseOzonReviewInfoPhotos(
    await deps.sellerPost("/v1/review/info", { review_id: review.id })
  )
  const stored: string[] = []
  for (const url of urls) {
    try {
      const bytes = await deps.download(url)
      const saved = await deps.storeImage(bytes)
      if (saved) stored.push(saved)
    } catch {
      // Keep the review even if a photo URL is gone.
    }
  }
  return stored
}

export async function importOzonReviews(
  deps: OzonReviewImportDeps
): Promise<OzonReviewImportResult> {
  const result: OzonReviewImportResult = {
    imported: 0,
    updated: 0,
    skipped_rating: 0,
    skipped_existing: 0,
    skipped_product: 0,
    skipped_empty: 0,
  }
  const listed = await listAllOzonReviews(deps.sellerPost)
  const wanted: OzonReviewListItem[] = []
  const seenIds = new Set<string>()
  for (const row of listed) {
    if (seenIds.has(row.id)) continue
    seenIds.add(row.id)
    if (row.rating !== 4 && row.rating !== 5) {
      result.skipped_rating += 1
      continue
    }
    if (!shouldImportOzonReview(row)) {
      result.skipped_empty += 1
      continue
    }
    wanted.push(row)
  }
  if (!wanted.length) return result

  const externalIds = wanted.map((row) => ozonReviewExternalId(row.id))
  const existing = await deps.listExistingExternalIds(externalIds)
  const publicBySku = new Map<number, Map<string, PublicOzonReviewCard>>()
  async function cardsFor(sku: number) {
    const cached = publicBySku.get(sku)
    if (cached) return cached
    const rows = deps.publicReviews
      ? await deps.publicReviews(sku).catch(() => [])
      : []
    const map = new Map(rows.map((card) => [card.id, card]))
    publicBySku.set(sku, map)
    return map
  }

  const skuOffers = await sellerSkuOffers(
    deps.sellerPost,
    wanted.map((row) => row.sku)
  )
  const offers = [
    ...new Set(
      wanted.map((row) => skuOffers.get(row.sku) || String(row.sku))
    ),
  ]
  const products = await deps.productIdByOffer(offers)
  const pinRows: PinCandidate[] = []

  for (const row of wanted) {
    const externalId = ozonReviewExternalId(row.id)
    const saved = existing.get(externalId)
    const card = (await cardsFor(row.sku)).get(row.id)
    const author = card?.author || row.author || saved?.author || OZON_REVIEW_AUTHOR
    const sourceUrl = card?.url || ozonReviewPageUrl(row.sku, row.id)
    const offer = skuOffers.get(row.sku) || String(row.sku)
    const productId = products.get(offer) || saved?.product_id || ""
    if (!productId) {
      result.skipped_product += 1
      continue
    }
    const keepPhotos = Boolean(saved?.image_urls.length)
    const imageUrls = keepPhotos ? saved!.image_urls : await reviewPhotos(deps, row)
    const fields = {
      product_id: productId,
      author:
        author !== OZON_REVIEW_AUTHOR
          ? author
          : saved?.author || OZON_REVIEW_AUTHOR,
      body: row.text,
      rating: row.rating,
      image_url: imageUrls[0] || null,
      image_urls: imageUrls,
      source_url: sourceUrl || saved?.source_url || null,
      external_id: externalId,
    }
    if (saved) {
      if (deps.updateReview) await deps.updateReview(saved.id, fields)
      pinRows.push({
        id: saved.id,
        productId,
        rating: row.rating,
        photos: imageUrls.length,
        textLength: row.text.length,
      })
      result.updated += 1
      continue
    }
    const created = await deps.createReview({
      ...fields,
      enabled: true,
      status: "published",
      ip: null,
    })
    const createdId = String(created?.id || "")
    if (createdId) {
      pinRows.push({
        id: createdId,
        productId,
        rating: row.rating,
        photos: imageUrls.length,
        textLength: row.text.length,
      })
    }
    existing.set(externalId, {
      id: createdId || externalId,
      author: fields.author,
      source_url: fields.source_url,
      product_id: productId,
      image_urls: imageUrls,
    })
    result.imported += 1
  }
  if (deps.pinReviews) {
    for (const reviewId of pickPinnedReviewIds(pinRows)) {
      const productId = pinRows.find((row) => row.id === reviewId)?.productId
      if (productId) await deps.pinReviews(productId, reviewId)
    }
  }
  return result
}

async function storeReviewBytes(
  container: MedusaContainer,
  bytes: Buffer
) {
  const files = container.resolve(Modules.FILE) as {
    createFiles: (data: {
      filename: string
      mimeType: string
      content: string
      access: "public"
    }) => Promise<{ url?: string } | Array<{ url?: string }>>
  }
  const webp = await convertToWebp(bytes)
  const filename = `review-${createHash("sha1").update(webp).digest("hex").slice(0, 16)}.webp`
  const created = await files.createFiles({
    filename,
    mimeType: "image/webp",
    content: webp.toString("base64"),
    access: "public",
  })
  const file = Array.isArray(created) ? created[0] : created
  return file?.url || null
}

async function listExistingExternalIds(
  reviews: ReviewModuleService,
  ids: string[]
) {
  const found = new Map<string, StoredOzonReview>()
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100)
    const rows = await reviews.listReviews(
      { external_id: chunk },
      { select: ["id", "external_id", "author", "source_url", "product_id", "image_urls", "image_url"], take: chunk.length }
    )
    for (const row of rows as Array<{
      id?: string
      external_id?: string | null
      author?: string | null
      source_url?: string | null
      product_id?: string | null
      image_url?: string | null
      image_urls?: unknown
    }>) {
      if (!row.external_id || !row.id) continue
      const imageUrls = Array.isArray(row.image_urls)
        ? row.image_urls.filter((url): url is string => typeof url === "string" && Boolean(url))
        : row.image_url
          ? [String(row.image_url)]
          : []
      found.set(row.external_id, {
        id: row.id,
        author: String(row.author || ""),
        source_url: row.source_url ? String(row.source_url) : null,
        product_id: String(row.product_id || ""),
        image_urls: imageUrls,
      })
    }
  }
  return found
}

async function productIdByOffer(
  container: MedusaContainer,
  offers: string[]
) {
  const product = container.resolve(Modules.PRODUCT) as {
    listProductVariants: (
      filters: { sku?: string[] },
      config?: { select?: string[]; take?: number }
    ) => Promise<Array<{ sku?: string | null; product_id?: string }>>
  }
  const map = new Map<string, string>()
  for (let i = 0; i < offers.length; i += 100) {
    const chunk = offers.slice(i, i + 100)
    const variants = await product.listProductVariants(
      { sku: chunk },
      { select: ["sku", "product_id"], take: chunk.length }
    )
    for (const variant of variants) {
      const sku = String(variant.sku || "").trim()
      const productId = String(variant.product_id || "").trim()
      if (sku && productId && !map.has(sku)) map.set(sku, productId)
    }
  }
  return map
}

export async function importOzonReviewsFromShop(container: MedusaContainer) {
  const row = (await getShopSetting(container)) as unknown as Record<
    string,
    unknown
  >
  const creds = ozonCredsFromRow(row)
  if (!ozonSellerReady(creds)) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Сначала подключите Ozon в настройках магазина"
    )
  }
  const reviews: ReviewModuleService = container.resolve(REVIEW_MODULE)
  try {
    return await importOzonReviews({
      sellerPost: (path, body) => sellerPost(creds, path, body),
      listExistingExternalIds: (ids) => listExistingExternalIds(reviews, ids),
      productIdByOffer: (offers) => productIdByOffer(container, offers),
      download: downloadUrl,
      storeImage: (bytes) => storeReviewBytes(container, bytes),
      publicReviews: fetchPublicOzonReviewCards,
      updateReview: async (id, patch) => {
        await reviews.updateReviews({ id, ...patch })
      },
      createReview: async (input) => {
        const created = await reviews.createReviews(input)
        const row = Array.isArray(created) ? created[0] : created
        return row as { id?: string }
      },
      pinReviews: async (productId, reviewId) => {
        const rows = await reviews.listReviews(
          { product_id: productId },
          { select: ["id", "pinned"], take: 500 }
        )
        for (const row of rows as Array<{ id?: string; pinned?: boolean }>) {
          if (!row.id) continue
          const pinned = row.id === reviewId
          if (Boolean(row.pinned) === pinned) continue
          await reviews.updateReviews({ id: row.id, pinned })
        }
      },
    })
  } catch (error) {
    throw new MedusaError(
      MedusaError.Types.UNEXPECTED_STATE,
      ozonAdminErrorMessage(error)
    )
  }
}
