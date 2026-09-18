import { ArrowLeft } from "@medusajs/icons"
import {
  Badge,
  Button,
  Container,
  Heading,
  Label,
  Select,
  Text,
  Textarea,
  toast,
} from "@medusajs/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { Link, useNavigate, useParams } from "react-router-dom"
import { sdk } from "../../../lib/sdk"

type ShopIssue = {
  id: string
  created_at: string | null
  shop_number: string | null
  email: string | null
  message: string
  status: string
  replies: Array<{ at: string; text: string }>
  source: string
  medusa_order_id: string | null
  can_refund: boolean
  can_cancel: boolean
  refunded: boolean
  order_status: { code: string; label: string } | null
  buyer_url: string | null
  admin_url: string | null
}

const REASONS = [
  { value: "order_error", label: "В заказе ошибка" },
  { value: "customer_request", label: "Отменили по вашей просьбе" },
  { value: "other", label: "Другая причина" },
]

function statusBadge(status: string) {
  if (status === "open") return <Badge color="orange">открыто</Badge>
  if (status === "refunded") return <Badge color="blue">возврат</Badge>
  if (status === "canceled") return <Badge color="red">отмена</Badge>
  return <Badge color="grey">закрыто</Badge>
}

const ShopIssuePage = () => {
  const { id = "" } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [reply, setReply] = useState("")
  const [refundNote, setRefundNote] = useState("")
  const [reason, setReason] = useState("order_error")
  const [cancelNote, setCancelNote] = useState("")

  const { data, isLoading } = useQuery({
    queryFn: () =>
      sdk.client.fetch<{ issue: ShopIssue }>(`/admin/shop-issues/${id}`),
    queryKey: ["admin-shop-issue", id],
    enabled: Boolean(id),
  })
  const issue = data?.issue

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["admin-shop-issue", id] })
    queryClient.invalidateQueries({ queryKey: ["admin-shop-issues"] })
  }

  const refund = useMutation({
    mutationFn: () =>
      sdk.client.fetch(`/admin/shop-issues/${id}/refund`, {
        method: "POST",
        body: { note: refundNote },
      }),
    onSuccess: () => {
      toast.success("Оплату вернули, заказ не отменяли")
      invalidate()
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Не удалось вернуть")
    },
  })

  const cancel = useMutation({
    mutationFn: (refundPayment: boolean) =>
      sdk.client.fetch(`/admin/shop-issues/${id}/cancel`, {
        method: "POST",
        body: { refund: refundPayment, reason, note: cancelNote },
      }),
    onSuccess: () => {
      toast.success("Заказ отменён")
      invalidate()
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Не удалось отменить")
    },
  })

  const sendReply = useMutation({
    mutationFn: () =>
      sdk.client.fetch(`/admin/shop-issues/${id}/reply`, {
        method: "POST",
        body: { message: reply },
      }),
    onSuccess: () => {
      toast.success("Письмо ушло")
      setReply("")
      invalidate()
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Не удалось отправить")
    },
  })

  const close = useMutation({
    mutationFn: () =>
      sdk.client.fetch(`/admin/shop-issues/${id}/close`, { method: "POST" }),
    onSuccess: () => {
      toast.success("Обращение закрыто")
      invalidate()
      navigate("/shop-issues")
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Не удалось закрыть")
    },
  })

  if (isLoading || !issue) {
    return (
      <Container className="p-6">
        <Text>{isLoading ? "Загрузка…" : "Обращение не найдено"}</Text>
      </Container>
    )
  }

  return (
    <div className="flex flex-col gap-y-4">
      <Container className="flex flex-col gap-y-4 p-6">
        <div className="flex items-center justify-between gap-x-4">
          <Button variant="transparent" onClick={() => navigate("/shop-issues")}>
            <ArrowLeft /> К списку
          </Button>
          {statusBadge(issue.status)}
        </div>
        <Heading>
          Заказ {issue.shop_number || "без номера"}
        </Heading>
        <Text size="small" className="text-ui-fg-subtle">
          {issue.email || "Почта неизвестна"}
          {issue.order_status ? ` · ${issue.order_status.label}` : ""}
          {issue.refunded ? " · оплата уже возвращена" : ""}
        </Text>
        <Text className="whitespace-pre-wrap">{issue.message}</Text>
        <div className="flex flex-wrap gap-2">
          {issue.admin_url ? (
            <Link to={issue.admin_url}>
              <Button variant="secondary" size="small">
                Открыть заказ
              </Button>
            </Link>
          ) : null}
          {issue.buyer_url ? (
            <a href={issue.buyer_url} target="_blank" rel="noreferrer">
              <Button variant="secondary" size="small">
                Страница покупателя
              </Button>
            </a>
          ) : null}
        </div>
      </Container>

      {issue.replies?.length ? (
        <Container className="flex flex-col gap-y-3 p-6">
          <Heading level="h2">Ответы</Heading>
          {issue.replies.map((item, index) => (
            <div key={`${item.at}-${index}`}>
              <Text size="small" className="text-ui-fg-subtle">
                {item.at
                  ? new Intl.DateTimeFormat("ru-RU", {
                      day: "2-digit",
                      month: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    }).format(new Date(item.at))
                  : ""}
              </Text>
              <Text className="whitespace-pre-wrap">{item.text}</Text>
            </div>
          ))}
        </Container>
      ) : null}

      <Container className="flex flex-col gap-y-4 p-6">
        <Heading level="h2">Ответить</Heading>
        <Textarea
          rows={4}
          value={reply}
          onChange={(event) => setReply(event.target.value)}
          placeholder="Текст письма покупателю"
        />
        <Button
          disabled={!reply.trim() || sendReply.isPending}
          onClick={() => sendReply.mutate()}
        >
          Отправить письмо
        </Button>
      </Container>

      {issue.can_refund || issue.can_cancel ? (
        <Container className="flex flex-col gap-y-4 p-6">
          <Heading level="h2">Деньги и отмена</Heading>
          <Text size="small" className="text-ui-fg-subtle">
            Возврат без отмены оставляет заказ доставленным. Отмена снимает заказ
            в Medusa и, если нужно, возвращает оплату.
          </Text>
          {issue.can_refund && !issue.refunded ? (
            <>
              <div className="flex flex-col gap-y-2">
                <Label>Комментарий к возврату</Label>
                <Textarea
                  rows={3}
                  value={refundNote}
                  onChange={(event) => setRefundNote(event.target.value)}
                />
              </div>
              <Button
                variant="secondary"
                disabled={refund.isPending}
                onClick={() => refund.mutate()}
              >
                Вернуть оплату без отмены
              </Button>
            </>
          ) : null}
          {issue.can_cancel ? (
            <>
              <div className="flex flex-col gap-y-2">
                <Label>Причина отмены</Label>
                <Select value={reason} onValueChange={setReason}>
                  <Select.Trigger>
                    <Select.Value />
                  </Select.Trigger>
                  <Select.Content>
                    {REASONS.map((item) => (
                      <Select.Item key={item.value} value={item.value}>
                        {item.label}
                      </Select.Item>
                    ))}
                  </Select.Content>
                </Select>
              </div>
              <Textarea
                rows={3}
                value={cancelNote}
                onChange={(event) => setCancelNote(event.target.value)}
                placeholder="Комментарий в письме об отмене"
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="danger"
                  disabled={cancel.isPending}
                  onClick={() => cancel.mutate(true)}
                >
                  Отменить и вернуть
                </Button>
                <Button
                  variant="secondary"
                  disabled={cancel.isPending}
                  onClick={() => cancel.mutate(false)}
                >
                  Отменить без возврата
                </Button>
              </div>
            </>
          ) : null}
        </Container>
      ) : null}

      {issue.status !== "closed" ? (
        <Container className="flex flex-col gap-y-3 p-6">
          <Heading level="h2">Закрыть</Heading>
          <Button
            variant="secondary"
            disabled={close.isPending}
            onClick={() => close.mutate()}
          >
            Обращение закрыто
          </Button>
        </Container>
      ) : null}
    </div>
  )
}

export default ShopIssuePage
