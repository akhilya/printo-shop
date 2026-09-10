import { MedusaContainer } from "@medusajs/framework"
import { Modules } from "@medusajs/framework/utils"
import { presentReview, type PresentedReview } from "./review-payload"

type ProductRow = {
  id: string
  title?: string
  handle?: string | null
  thumbnail?: string | null
}

export async function withProductTitles(
  container: MedusaContainer,
  reviews: Record<string, unknown>[]
): Promise<PresentedReview[]> {
  const presented = reviews.map((row) => presentReview(row, { includeIp: true }))
  const ids = [...new Set(presented.map((row) => row.product_id).filter(Boolean))]
  if (!ids.length) return presented

  const productModule = container.resolve(Modules.PRODUCT) as {
    listProducts: (
      filters: { id: string[] },
      config?: { select?: string[] }
    ) => Promise<ProductRow[]>
  }
  const products = await productModule.listProducts(
    { id: ids },
    { select: ["id", "title", "handle", "thumbnail"] }
  )
  const byId = new Map(products.map((product) => [product.id, product]))

  return presented.map((review) => {
    const product = byId.get(review.product_id)
    if (!product) return { ...review, product: null }
    return {
      ...review,
      product: {
        id: product.id,
        title: product.title || review.product_id,
        handle: product.handle ?? null,
        thumbnail: product.thumbnail ?? null,
      },
    }
  })
}
