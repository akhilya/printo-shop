import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import { createHash } from "node:crypto"
import { convertToWebp } from "../../../lib/delegat-bridge/ingest-images-io"
import { decodeReviewImageBase64 } from "../../../lib/review-image"
import { clientIp } from "../../../lib/client-ip"
import { parseReviewInput, presentReview } from "../../../lib/review-payload"
import { checkSubmitLimit } from "../../../lib/submit-limit"
import { REVIEW_MODULE } from "../../../modules/reviews"
import type ReviewModuleService from "../../../modules/reviews/service"

async function storeReviewImage(scope: MedusaRequest["scope"], content: string) {
  const files = scope.resolve(Modules.FILE) as {
    createFiles: (data: {
      filename: string
      mimeType: string
      content: string
      access: "public"
    }) => Promise<{ url?: string } | Array<{ url?: string }>>
  }
  const raw = decodeReviewImageBase64(content)
  const webp = await convertToWebp(raw)
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

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const productId = String(req.query.product_id || "")
  if (!productId) {
    res.json({ reviews: [] })
    return
  }
  const service: ReviewModuleService = req.scope.resolve(REVIEW_MODULE)
  const [reviews] = await service.listAndCountReviews(
    { product_id: productId, status: "published" },
    { order: { created_at: "DESC" }, take: 50 }
  )
  res.json({ reviews: reviews.map((row) => presentReview(row as Record<string, unknown>)) })
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const ip = clientIp(req)
  const limit = checkSubmitLimit(`review:${ip}`)
  if ("error" in limit) {
    res.status(429).json({ message: limit.error })
    return
  }
  const parsed = parseReviewInput(req.body)
  if ("error" in parsed) {
    res.status(400).json({ message: parsed.error })
    return
  }

  const imageUrls: string[] = []
  if (parsed.images.length) {
    try {
      for (const content of parsed.images) {
        const url = await storeReviewImage(req.scope, content)
        if (url) imageUrls.push(url)
      }
    } catch (error) {
      const code = error instanceof Error ? error.message : ""
      if (code === "too_large") {
        res.status(400).json({ message: "Фото больше 5 МБ" })
        return
      }
      res.status(400).json({ message: "Не удалось прочитать фото" })
      return
    }
  }

  const service: ReviewModuleService = req.scope.resolve(REVIEW_MODULE)
  const review = await service.createReviews({
    product_id: parsed.productId,
    author: parsed.author,
    body: parsed.text,
    rating: parsed.rating,
    image_url: imageUrls[0] || null,
    image_urls: imageUrls as unknown as Record<string, unknown>,
    enabled: false,
    status: "moderation",
    ip,
  })
  res.status(201).json({
    review: presentReview(review as unknown as Record<string, unknown>),
  })
}
