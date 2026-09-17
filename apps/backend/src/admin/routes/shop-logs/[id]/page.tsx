import { ArrowLeft } from "@medusajs/icons"
import { Badge, Button, Container, Heading, Text, toast } from "@medusajs/ui"
import { useQuery } from "@tanstack/react-query"
import type { ReactNode } from "react"
import { Link, useNavigate, useParams } from "react-router-dom"
import { sdk } from "../../../lib/sdk"

type ShopLog = {
  id: string
  kind: string
  level: string
  title: string
  message: string
  detail: string | null
  dump: string
  order_id: string | null
  shop_number: string | null
  posting_number: string | null
  from_status: string | null
  to_status: string | null
  created_at: string | null
  updated_at: string | null
}

const KIND_LABEL: Record<string, string> = {
  ozon_create: "Создание отправления",
  ozon_pack: "Сборка",
  ozon_status: "Статус",
  ozon_unclaimed: "Невыкуп",
  ozon_refused: "Отказ на ПВЗ",
  ozon_returned: "Возврат",
  ozon_sync: "Синхронизация",
  mail: "Письмо",
  order_message: "Письмо по заказу",
}

function levelBadge(level: string) {
  if (level === "error") return <Badge color="red">ошибка</Badge>
  if (level === "warn") return <Badge color="orange">внимание</Badge>
  return <Badge color="grey">событие</Badge>
}

function formatWhen(value: string | null) {
  if (!value) return "—"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  const local = new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date)
  return `${local} (${date.toISOString()})`
}

function copyText(value: string, ok = "Скопировано") {
  void navigator.clipboard.writeText(value).then(
    () => toast.success(ok),
    () => toast.error("Не удалось скопировать")
  )
}

function Field({
  label,
  value,
  children,
}: {
  label: string
  value?: string | null
  children?: ReactNode
}) {
  const text = value?.trim() || ""
  return (
    <div className="flex flex-col gap-y-1">
      <div className="flex items-center justify-between gap-x-3">
        <Text size="small" weight="plus" className="text-ui-fg-subtle">
          {label}
        </Text>
        {text ? (
          <Button
            size="small"
            variant="transparent"
            onClick={() => copyText(text)}
          >
            Копировать
          </Button>
        ) : null}
      </div>
      {children || (
        <Text className="break-all whitespace-pre-wrap font-mono text-xs">
          {text || "—"}
        </Text>
      )}
    </div>
  )
}

function Block({ label, value }: { label: string; value: string | null }) {
  const text = (value || "").trim()
  return (
    <div className="flex flex-col gap-y-2">
      <div className="flex items-center justify-between gap-x-3">
        <Text size="small" weight="plus">
          {label}
        </Text>
        {text ? (
          <Button
            size="small"
            variant="secondary"
            onClick={() => copyText(text)}
          >
            Копировать
          </Button>
        ) : null}
      </div>
      <pre className="border-ui-border-base bg-ui-bg-subtle max-h-[70vh] overflow-auto whitespace-pre-wrap break-all rounded-md border p-3 font-mono text-xs leading-5">
        {text || "—"}
      </pre>
    </div>
  )
}

const ShopLogDetailPage = () => {
  const { id = "" } = useParams()
  const navigate = useNavigate()
  const { data, isLoading, isError } = useQuery({
    queryFn: () =>
      sdk.client.fetch<{ log: ShopLog }>(`/admin/shop-logs/${id}`),
    queryKey: ["admin-shop-log", id],
    enabled: Boolean(id),
  })
  const log = data?.log

  if (isLoading) {
    return (
      <Container>
        <Text>Загрузка</Text>
      </Container>
    )
  }

  if (isError || !log) {
    return (
      <Container className="flex flex-col gap-y-4">
        <Text>Запись не найдена</Text>
        <Button variant="secondary" onClick={() => navigate("/shop-logs")}>
          К журналу
        </Button>
      </Container>
    )
  }

  const json = JSON.stringify(log, null, 2)
  const kindLabel = KIND_LABEL[log.kind] || log.kind

  return (
    <div className="flex flex-col gap-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button
          variant="transparent"
          onClick={() => navigate("/shop-logs")}
          className="px-0"
        >
          <ArrowLeft />
          Журнал
        </Button>
        <Button variant="secondary" onClick={() => copyText(json, "JSON скопирован")}>
          Скопировать всё
        </Button>
      </div>
      <Container className="divide-y p-0">
        <div className="flex flex-col gap-y-2 px-6 py-4">
          <div className="flex flex-wrap items-center gap-2">
            {levelBadge(log.level)}
            <Badge color="grey">{kindLabel}</Badge>
          </div>
          <Heading>{log.title}</Heading>
          <Text size="small" className="text-ui-fg-subtle">
            {formatWhen(log.created_at)}
          </Text>
        </div>
        <div className="flex flex-col gap-y-4 px-6 py-4">
          <Field label="id" value={log.id} />
          <Field label="kind" value={log.kind} />
          <Field label="level" value={log.level} />
          <Field label="Заголовок" value={log.title} />
          <Field label="Номер заказа" value={log.shop_number}>
            {log.shop_number ? (
              <Text className="break-all font-mono text-xs">
                {log.shop_number}
              </Text>
            ) : (
              <Text className="text-ui-fg-subtle">—</Text>
            )}
          </Field>
          <Field label="order_id" value={log.order_id}>
            {log.order_id ? (
              <Link
                to={`/orders/${log.order_id}`}
                className="text-ui-fg-interactive break-all font-mono text-xs hover:underline"
              >
                {log.order_id}
              </Link>
            ) : (
              <Text className="text-ui-fg-subtle">—</Text>
            )}
          </Field>
          <Field label="posting_number" value={log.posting_number} />
          <Field label="from_status" value={log.from_status} />
          <Field label="to_status" value={log.to_status} />
          <Field label="created_at" value={formatWhen(log.created_at)} />
          <Field label="updated_at" value={formatWhen(log.updated_at)} />
        </div>
        <div className="flex flex-col gap-y-6 px-6 py-4">
          <Block label="Сообщение" value={log.message} />
          <Block label="Подробности" value={log.detail} />
          <Block label="Разобранный текст" value={log.dump} />
          <Block label="JSON записи" value={json} />
        </div>
      </Container>
    </div>
  )
}

export default ShopLogDetailPage
