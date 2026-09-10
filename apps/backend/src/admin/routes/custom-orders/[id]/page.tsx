import { ArrowLeft, Trash } from "@medusajs/icons"
import { Button, Container, Heading, Text, toast } from "@medusajs/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Link, useNavigate, useParams } from "react-router-dom"
import { messengerHref } from "../../../../lib/custom-order"
import { sdk } from "../../../lib/sdk"

type AdminCustomOrder = {
  id: string
  name: string
  email: string | null
  phone: string | null
  telegram: string | null
  max_account: string | null
  vk: string | null
  message: string
  product_id: string | null
  product_title: string | null
  image_urls: string[]
  status: string
  ip?: string | null
  created_at?: string
}

const STATUS_OPTIONS = [
  { value: "new", label: "Новая" },
  { value: "in_progress", label: "В работе" },
  { value: "closed", label: "Закрыта" },
]

const CustomOrderDetailPage = () => {
  const { id = "" } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const { data, isLoading, isError } = useQuery({
    queryFn: () =>
      sdk.client.fetch<{ order: AdminCustomOrder }>(
        `/admin/custom-orders/${id}`
      ),
    queryKey: ["admin-custom-order", id],
    enabled: Boolean(id),
  })

  const statusMutation = useMutation({
    mutationFn: (status: string) =>
      sdk.client.fetch(`/admin/custom-orders/${id}`, {
        method: "POST",
        body: { status },
      }),
    onSuccess: () => {
      toast.success("Статус обновлён")
      queryClient.invalidateQueries({ queryKey: ["admin-custom-order", id] })
      queryClient.invalidateQueries({ queryKey: ["admin-custom-orders"] })
    },
    onError: () => toast.error("Не удалось обновить статус"),
  })

  const blockMutation = useMutation({
    mutationFn: (ip: string) =>
      sdk.client.fetch("/admin/blocked-ips", {
        method: "POST",
        body: { ip, reason: `Заявка ${id}` },
      }),
    onSuccess: () => toast.success("IP заблокирован"),
    onError: () => toast.error("Не удалось заблокировать IP"),
  })

  const deleteMutation = useMutation({
    mutationFn: () =>
      sdk.client.fetch(`/admin/custom-orders/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Заявка удалена")
      navigate("/custom-orders")
    },
    onError: () => toast.error("Не удалось удалить заявку"),
  })

  const order = data?.order

  if (isLoading) {
    return (
      <Container>
        <Text>Загрузка</Text>
      </Container>
    )
  }

  if (isError || !order) {
    return (
      <Container>
        <Text>Заявка не найдена</Text>
      </Container>
    )
  }

  const created = order.created_at
    ? new Intl.DateTimeFormat("ru-RU", {
        dateStyle: "long",
        timeStyle: "short",
      }).format(new Date(order.created_at))
    : ""

  return (
    <div className="flex flex-col gap-y-4">
      <div className="flex items-center justify-between">
        <Button
          variant="transparent"
          className="px-0"
          onClick={() => navigate("/custom-orders")}
        >
          <ArrowLeft />
          Заявки
        </Button>
        <Button
          variant="danger"
          onClick={() => {
            if (window.confirm("Удалить заявку?")) deleteMutation.mutate()
          }}
          isLoading={deleteMutation.isPending}
        >
          <Trash />
          Удалить
        </Button>
      </div>
      <Container className="divide-y p-0">
        <div className="px-6 py-4">
          <Heading>{order.name}</Heading>
          <Text size="small" className="text-ui-fg-subtle">
            {created}
          </Text>
        </div>
        <div className="flex flex-col gap-y-3 px-6 py-4">
          {order.email ? (
            <Text>
              Почта:{" "}
              <a className="text-ui-fg-interactive" href={`mailto:${order.email}`}>
                {order.email}
              </a>
            </Text>
          ) : null}
          {order.phone ? <Text>Телефон: {order.phone}</Text> : null}
          {order.telegram ? (
            <Text>
              Telegram:{" "}
              <a
                className="text-ui-fg-interactive"
                href={messengerHref(order.telegram, "telegram")}
                target="_blank"
                rel="noreferrer"
              >
                {order.telegram}
              </a>
            </Text>
          ) : null}
          {order.max_account ? <Text>MAX: {order.max_account}</Text> : null}
          {order.vk ? (
            <Text>
              ВКонтакте:{" "}
              <a
                className="text-ui-fg-interactive"
                href={messengerHref(order.vk, "vk")}
                target="_blank"
                rel="noreferrer"
              >
                {order.vk}
              </a>
            </Text>
          ) : null}
          {order.product_id ? (
            <Link
              to={`/products/${order.product_id}`}
              className="text-ui-fg-interactive hover:underline"
            >
              {order.product_title || order.product_id}
            </Link>
          ) : (
            <Text size="small" className="text-ui-fg-subtle">
              Своя модель, без привязки к каталогу
            </Text>
          )}
          {order.ip ? (
            <div className="flex flex-wrap items-center gap-2">
              <Text size="small">IP: {order.ip}</Text>
              <Button
                size="small"
                variant="secondary"
                isLoading={blockMutation.isPending}
                onClick={() => blockMutation.mutate(order.ip as string)}
              >
                Заблокировать IP
              </Button>
            </div>
          ) : null}
          <Text className="whitespace-pre-wrap">{order.message}</Text>
          <div className="flex flex-col gap-y-2">
            <Text size="small" weight="plus">
              Статус
            </Text>
            <div className="flex flex-wrap gap-2">
              {STATUS_OPTIONS.map((option) => (
                <Button
                  key={option.value}
                  size="small"
                  variant={order.status === option.value ? "primary" : "secondary"}
                  disabled={statusMutation.isPending}
                  onClick={() => {
                    if (option.value !== order.status) {
                      statusMutation.mutate(option.value)
                    }
                  }}
                >
                  {option.label}
                </Button>
              ))}
            </div>
          </div>
        </div>
        {order.image_urls?.length ? (
          <div className="flex flex-wrap gap-3 px-6 py-4">
            {order.image_urls.map((url) => (
              <a
                key={url}
                href={url}
                target="_blank"
                rel="noreferrer"
                className="border-ui-border-base block size-32 overflow-hidden border"
              >
                <img src={url} alt="" className="size-full object-contain" />
              </a>
            ))}
          </div>
        ) : null}
      </Container>
    </div>
  )
}

export default CustomOrderDetailPage
