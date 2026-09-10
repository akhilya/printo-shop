import { defineWidgetConfig } from "@medusajs/admin-sdk"
import { Star } from "@medusajs/icons"
import type { DetailWidgetProps, HttpTypes } from "@medusajs/types"
import { Button, Container, Heading, Text } from "@medusajs/ui"
import { useQuery } from "@tanstack/react-query"
import { useNavigate } from "react-router-dom"
import { sdk } from "../lib/sdk"

type AdminReview = {
  id: string
  author: string
  body: string
  rating: number | null
  status: string
  created_at?: string
}

const ProductReviewsWidget = ({
  data,
}: DetailWidgetProps<HttpTypes.AdminProduct>) => {
  const navigate = useNavigate()
  const { data: payload, isLoading } = useQuery({
    queryFn: () =>
      sdk.client.fetch<{ reviews: AdminReview[]; count: number }>(
        "/admin/reviews",
        {
          query: { product_id: data.id, limit: 5, offset: 0 },
        }
      ),
    queryKey: ["admin-reviews", data.id],
  })

  const reviews = payload?.reviews || []
  const count = payload?.count || 0

  return (
    <Container className="divide-y p-0">
      <div className="flex items-center justify-between px-6 py-4">
        <Heading level="h2">Отзывы{count ? ` (${count})` : ""}</Heading>
        <Button
          size="small"
          variant="secondary"
          onClick={() => navigate(`/reviews?product_id=${data.id}`)}
        >
          Все
        </Button>
      </div>
      <div className="px-6 py-4">
        {isLoading ? (
          <Text size="small" className="text-ui-fg-subtle">
            Загрузка
          </Text>
        ) : reviews.length === 0 ? (
          <Text size="small" className="text-ui-fg-subtle">
            Отзывов пока нет
          </Text>
        ) : (
          <div className="flex flex-col gap-y-4">
            {reviews.map((review) => (
              <button
                key={review.id}
                type="button"
                className="hover:bg-ui-bg-subtle-hover -mx-2 rounded-md px-2 py-1 text-left"
                onClick={() => navigate(`/reviews/${review.id}`)}
              >
                <Text size="small" weight="plus">
                  {review.author}
                  {review.rating ? (
                    <span className="text-ui-fg-subtle ml-2 inline-flex items-center gap-x-0.5 font-normal">
                      <Star />
                      {review.rating}
                    </span>
                  ) : null}
                  <span className="text-ui-fg-subtle ml-2 font-normal">
                    {review.status === "published"
                      ? "Опубликован"
                      : "На модерации"}
                  </span>
                </Text>
                <Text size="small" className="text-ui-fg-subtle line-clamp-2">
                  {review.body}
                </Text>
              </button>
            ))}
          </div>
        )}
      </div>
    </Container>
  )
}

export const config = defineWidgetConfig({
  zone: "product.details.side.after",
})

export default ProductReviewsWidget
