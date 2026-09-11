import { ArrowLeft, Trash } from "@medusajs/icons"
import {
  Button,
  Container,
  Heading,
  Input,
  Label,
  Switch,
  Text,
  Textarea,
  toast,
} from "@medusajs/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useState } from "react"
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
  quote_amount: number | null
  quote_items_amount: number | null
  quote_discount_amount: number | null
  quote_shipping_amount: number | null
  quote_other_amount: number | null
  quote_note: string | null
  delivery_method: string | null
  client_picks_pvz: boolean
  shop_number: string | null
  order_url: string | null
  checkout_token: string | null
  checkout_url: string | null
  paid_at: string | null
  created_at?: string
}

const STATUS_OPTIONS = [
  { value: "new", label: "Новая" },
  { value: "in_progress", label: "В работе" },
  { value: "quoted", label: "Счёт" },
  { value: "paid", label: "Оплачена" },
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

  const [itemsAmount, setItemsAmount] = useState("")
  const [discountAmount, setDiscountAmount] = useState("")
  const [shippingAmount, setShippingAmount] = useState("")
  const [otherAmount, setOtherAmount] = useState("")
  const [note, setNote] = useState("")
  const [delivery, setDelivery] = useState("")
  const [picksPvz, setPicksPvz] = useState(false)

  const quoteTotal = (() => {
    const items = Number(itemsAmount.replace(",", ".")) || 0
    const discount = Number(discountAmount.replace(",", ".")) || 0
    const shipping = Number(shippingAmount.replace(",", ".")) || 0
    const other = Number(otherAmount.replace(",", ".")) || 0
    return Math.max(0, items - discount + shipping + other)
  })()

  const checkoutMutation = useMutation({
    mutationFn: () =>
      sdk.client.fetch<{ order: AdminCustomOrder }>(
        `/admin/custom-orders/${id}/checkout-link`,
        {
          method: "POST",
          body: {
            quote_items_amount: Number(itemsAmount.replace(",", ".")),
            quote_discount_amount: Number(discountAmount.replace(",", ".") || 0),
            quote_shipping_amount: Number(shippingAmount.replace(",", ".") || 0),
            quote_other_amount: Number(otherAmount.replace(",", ".") || 0),
            quote_note: note,
            delivery_method: delivery,
            client_picks_pvz: picksPvz,
          },
        }
      ),
    onSuccess: async (payload) => {
      toast.success("Ссылка готова")
      queryClient.invalidateQueries({ queryKey: ["admin-custom-order", id] })
      queryClient.invalidateQueries({ queryKey: ["admin-custom-orders"] })
      const url = payload.order?.checkout_url
      if (url && navigator.clipboard?.writeText) {
        try {
          await navigator.clipboard.writeText(url)
          toast.success("Ссылка скопирована")
        } catch {
          /* ignore */
        }
      }
    },
    onError: () => toast.error("Не удалось сформировать ссылку"),
  })

  const order = data?.order

  useEffect(() => {
    if (!order) return
    setItemsAmount(
      order.quote_items_amount != null
        ? String(order.quote_items_amount)
        : order.quote_amount != null
          ? String(order.quote_amount)
          : ""
    )
    setDiscountAmount(
      order.quote_discount_amount != null
        ? String(order.quote_discount_amount)
        : ""
    )
    setShippingAmount(
      order.quote_shipping_amount != null
        ? String(order.quote_shipping_amount)
        : ""
    )
    setOtherAmount(
      order.quote_other_amount != null ? String(order.quote_other_amount) : ""
    )
    setNote(order.quote_note || "")
    setDelivery(order.delivery_method || "")
    setPicksPvz(order.client_picks_pvz === true)
  }, [order])

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
      <Container className="flex flex-col gap-y-4 p-6">
        <Heading level="h2">Оформление для клиента</Heading>
        <Text size="small" className="text-ui-fg-subtle">
          Страница как после корзины: состав, цена
          {delivery === "ozon" && picksPvz ? ", выбор ПВЗ Ozon" : ""} и оплата.
          Ссылку можно отправить клиенту.
        </Text>
        {order.paid_at ? (
          <Text>Оплачено. Ссылка ещё открывается, повторно платить нельзя.</Text>
        ) : null}
        <div className="flex flex-col gap-y-2">
          <Label>Товары, ₽</Label>
          <Input
            type="number"
            min={1}
            step={1}
            value={itemsAmount}
            disabled={Boolean(order.paid_at)}
            onChange={(event) => setItemsAmount(event.target.value)}
          />
        </div>
        <div className="flex flex-col gap-y-2">
          <Label>Скидка, ₽</Label>
          <Input
            type="number"
            min={0}
            step={1}
            value={discountAmount}
            disabled={Boolean(order.paid_at)}
            onChange={(event) => setDiscountAmount(event.target.value)}
          />
        </div>
        <div className="flex flex-col gap-y-2">
          <Label>Доставка, ₽</Label>
          <Input
            type="number"
            min={0}
            step={1}
            value={shippingAmount}
            disabled={Boolean(order.paid_at)}
            onChange={(event) => setShippingAmount(event.target.value)}
          />
        </div>
        <div className="flex flex-col gap-y-2">
          <Label>Ещё, ₽</Label>
          <Input
            type="number"
            min={0}
            step={1}
            value={otherAmount}
            disabled={Boolean(order.paid_at)}
            onChange={(event) => setOtherAmount(event.target.value)}
          />
        </div>
        <Text weight="plus">Итого: {quoteTotal} ₽</Text>
        <div className="flex flex-col gap-y-2">
          <Label>Что увидит клиент</Label>
          <Textarea
            rows={4}
            value={note}
            disabled={Boolean(order.paid_at)}
            placeholder={order.message || "Описание заказа"}
            onChange={(event) => setNote(event.target.value)}
          />
        </div>
        <div className="flex flex-col gap-y-2">
          <Label>Доставка</Label>
          <div className="flex flex-wrap gap-2">
            <Button
              size="small"
              type="button"
              variant={delivery === "" ? "primary" : "secondary"}
              disabled={Boolean(order.paid_at)}
              onClick={() => {
                setDelivery("")
                setPicksPvz(false)
              }}
            >
              Не в ссылке
            </Button>
            <Button
              size="small"
              type="button"
              variant={delivery === "ozon" ? "primary" : "secondary"}
              disabled={Boolean(order.paid_at)}
              onClick={() => setDelivery("ozon")}
            >
              Ozon Доставка
            </Button>
          </div>
        </div>
        {delivery === "ozon" ? (
          <div className="flex items-center justify-between gap-4">
            <Label>Клиент сам выберет ПВЗ</Label>
            <Switch
              checked={picksPvz}
              disabled={Boolean(order.paid_at)}
              onCheckedChange={(checked) => setPicksPvz(Boolean(checked))}
            />
          </div>
        ) : null}
        <Button
          onClick={() => checkoutMutation.mutate()}
          isLoading={checkoutMutation.isPending}
          disabled={Boolean(order.paid_at) || quoteTotal < 1}
        >
          Сформировать ссылку
        </Button>
        {order.shop_number ? (
          <Text>
            Номер заказа: {order.shop_number}
            {order.order_url ? (
              <>
                {" "}
                <a
                  className="text-ui-fg-interactive"
                  href={order.order_url}
                  target="_blank"
                  rel="noreferrer"
                >
                  Открыть
                </a>
              </>
            ) : null}
          </Text>
        ) : null}
        {order.checkout_url ? (
          <div className="flex flex-col gap-y-2">
            <Label>Ссылка на оплату</Label>
            <Input readOnly value={order.checkout_url} />
            <Button
              variant="secondary"
              type="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(order.checkout_url as string)
                  toast.success("Ссылка скопирована")
                } catch {
                  toast.error("Скопируйте ссылку вручную")
                }
              }}
            >
              Копировать
            </Button>
          </div>
        ) : null}
      </Container>
    </div>
  )
}

export default CustomOrderDetailPage
