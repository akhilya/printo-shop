import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { withProductTitles } from "../../../../lib/review-admin"
import { parseReviewStatus } from "../../../../lib/review-payload"
import { REVIEW_MODULE } from "../../../../modules/reviews"
import type ReviewModuleService from "../../../../modules/reviews/service"

export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) {
  const id = String(req.params.id || "")
  const service: ReviewModuleService = req.scope.resolve(REVIEW_MODULE)
  try {
    const row = await service.retrieveReview(id)
    const [review] = await withProductTitles(req.scope, [
      row as unknown as Record<string, unknown>,
    ])
    res.json({ review })
  } catch {
    res.status(404).json({ message: "Отзыв не найден" })
  }
}

export async function POST(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) {
  const id = String(req.params.id || "")
  const status = parseReviewStatus(req.body)
  if (typeof status !== "string") {
    res.status(400).json({ message: status.error })
    return
  }
  const service: ReviewModuleService = req.scope.resolve(REVIEW_MODULE)
  try {
    await service.retrieveReview(id)
  } catch {
    res.status(404).json({ message: "Отзыв не найден" })
    return
  }
  const updated = await service.updateReviews({
    id,
    status,
    enabled: status === "published",
  })
  const row = Array.isArray(updated) ? updated[0] : updated
  const [review] = await withProductTitles(req.scope, [
    (row || { id, status }) as unknown as Record<string, unknown>,
  ])
  res.json({ review })
}

export async function DELETE(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) {
  const id = String(req.params.id || "")
  const service: ReviewModuleService = req.scope.resolve(REVIEW_MODULE)
  try {
    await service.retrieveReview(id)
  } catch {
    res.status(404).json({ message: "Отзыв не найден" })
    return
  }
  await service.deleteReviews(id)
  res.json({ id, deleted: true })
}
