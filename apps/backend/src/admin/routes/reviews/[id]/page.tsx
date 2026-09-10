import { ArrowLeft, Star, Trash } from "@medusajs/icons"
import { Button, Container, Heading, Text, toast } from "@medusajs/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Link, useNavigate, useParams } from "react-router-dom"
import { sdk } from "../../../lib/sdk"

type AdminReview = {
  id: string
  product_id: string
  author: string
  body: string
  rating: number | null
  image_urls: string[]
  status: string
  ip?: string | null
  created_at?: string
  product?: { id: string; title: string } | null
}

const ReviewDetailPage = () => {
  const { id = "" } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const { data, isLoading, isError } = useQuery({
    queryFn: () =>
      sdk.client.fetch<{ review: AdminReview }>(`/admin/reviews/${id}`),
    queryKey: ["admin-review", id],
    enabled: Boolean(id),
  })

  const statusMutation = useMutation({
    mutationFn: (status: string) =>
      sdk.client.fetch(`/admin/reviews/${id}`, {
        method: "POST",
        body: { status },
      }),
    onSuccess: () => {
      toast.success("Статус обновлён")
      queryClient.invalidateQueries({ queryKey: ["admin-review", id] })
      queryClient.invalidateQueries({ queryKey: ["admin-reviews"] })
    },
    onError: () => toast.error("Не удалось обновить статус"),
  })

  const blockMutation = useMutation({
    mutationFn: (ip: string) =>
      sdk.client.fetch("/admin/blocked-ips", {
        method: "POST",
        body: { ip, reason: `Отзыв ${id}` },
      }),
    onSuccess: () => toast.success("IP заблокирован"),
    onError: () => toast.error("Не удалось заблокировать IP"),
  })

  const deleteMutation = useMutation({
    mutationFn: () =>
      sdk.client.fetch(`/admin/reviews/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Отзыв удалён")
      navigate("/reviews")
    },
    onError: () => {
      toast.error("Не удалось удалить отзыв")
    },
  })

  const review = data?.review

  async function onDelete() {
    const ok = window.confirm("Удалить этот отзыв? Это нельзя отменить.")
    if (!ok) return
    deleteMutation.mutate()
  }

  if (isLoading) {
    return (
      <Container>
        <Text>Загрузка</Text>
      </Container>
    )
  }

  if (isError || !review) {
    return (
      <Container className="flex flex-col gap-y-4">
        <Text>Отзыв не найден</Text>
        <Button variant="secondary" onClick={() => navigate("/reviews")}>
          К списку
        </Button>
      </Container>
    )
  }

  const created = review.created_at
    ? new Intl.DateTimeFormat("ru-RU", {
        dateStyle: "long",
        timeStyle: "short",
      }).format(new Date(review.created_at))
    : ""

  return (
    <div className="flex flex-col gap-y-4">
      <div className="flex items-center justify-between">
        <Button
          variant="transparent"
          onClick={() => navigate("/reviews")}
          className="px-0"
        >
          <ArrowLeft />
          Отзывы
        </Button>
        <Button
          variant="danger"
          onClick={onDelete}
          isLoading={deleteMutation.isPending}
        >
          <Trash />
          Удалить
        </Button>
      </div>
      <Container className="divide-y p-0">
        <div className="px-6 py-4">
          <Heading>{review.author}</Heading>
          <Text size="small" className="text-ui-fg-subtle">
            {created}
          </Text>
        </div>
        <div className="flex flex-col gap-y-3 px-6 py-4">
          <div className="flex flex-col gap-y-2">
            <Text size="small" weight="plus">
              Статус
            </Text>
            <div className="flex flex-wrap gap-2">
              <Button
                size="small"
                variant={review.status !== "published" ? "primary" : "secondary"}
                disabled={statusMutation.isPending}
                onClick={() => statusMutation.mutate("moderation")}
              >
                На модерации
              </Button>
              <Button
                size="small"
                variant={review.status === "published" ? "primary" : "secondary"}
                disabled={statusMutation.isPending}
                onClick={() => statusMutation.mutate("published")}
              >
                Опубликован
              </Button>
            </div>
          </div>
          {review.ip ? (
            <div className="flex flex-wrap items-center gap-2">
              <Text size="small">IP: {review.ip}</Text>
              <Button
                size="small"
                variant="secondary"
                isLoading={blockMutation.isPending}
                onClick={() => blockMutation.mutate(review.ip as string)}
              >
                Заблокировать IP
              </Button>
            </div>
          ) : null}
          {review.rating ? (
            <Text className="inline-flex items-center gap-x-1">
              <Star />
              {review.rating}/5
            </Text>
          ) : null}
          {review.product ? (
            <Link
              to={`/products/${review.product.id}`}
              className="text-ui-fg-interactive hover:underline"
            >
              {review.product.title}
            </Link>
          ) : (
            <Text size="small" className="text-ui-fg-subtle">
              {review.product_id}
            </Text>
          )}
          <Text className="whitespace-pre-wrap">{review.body}</Text>
        </div>
        {review.image_urls?.length ? (
          <div className="flex flex-wrap gap-3 px-6 py-4">
            {review.image_urls.map((url) => (
              <a
                key={url}
                href={url}
                target="_blank"
                rel="noreferrer"
                className="border-ui-border-base block size-32 overflow-hidden border"
              >
                <img
                  src={url}
                  alt=""
                  className="size-full object-contain"
                />
              </a>
            ))}
          </div>
        ) : null}
      </Container>
    </div>
  )
}

export default ReviewDetailPage
