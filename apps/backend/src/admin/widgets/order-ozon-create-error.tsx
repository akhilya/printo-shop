import { defineWidgetConfig } from "@medusajs/admin-sdk"
import type { DetailWidgetProps, HttpTypes } from "@medusajs/types"
import { Button, Container, Heading, Text, toast } from "@medusajs/ui"
import { useState } from "react"
import { sdk } from "../lib/sdk"

const OrderOzonCreateErrorWidget = ({
  data,
}: DetailWidgetProps<HttpTypes.AdminOrder>) => {
  const metadata = (data.metadata || {}) as Record<string, unknown>
  const error = String(metadata.ozon_create_error || "").trim()
  const attemptsValue = Number(metadata.ozon_create_attempts)
  const attempts =
    Number.isSafeInteger(attemptsValue) && attemptsValue > 0
      ? attemptsValue
      : 0
  const retryAfterValue = Date.parse(
    String(metadata.ozon_create_retry_after || "")
  )
  const retryAfter = Number.isFinite(retryAfterValue)
    ? new Date(retryAfterValue).toLocaleString("ru-RU")
    : null
  const alreadyCreated = Boolean(
    metadata.ozon_order_number || metadata.ozon_posting_number
  )
  const canceled = data.status === "canceled"
  const diagnostics =
    metadata.ozon_create_diagnostics &&
    typeof metadata.ozon_create_diagnostics === "object"
      ? JSON.stringify(metadata.ozon_create_diagnostics, null, 2)
      : ""
  const [busy, setBusy] = useState(false)

  if (!error) return null

  async function createNow(provider?: "delivery_api") {
    setBusy(true)
    try {
      const result = await sdk.client.fetch<{ message: string }>(
        `/admin/shop-orders/${data.id}/retry-ozon`,
        {
          method: "POST",
          body: provider ? { provider } : {},
        }
      )
      toast.success(result.message)
      window.location.reload()
    } catch (caught) {
      toast.error(
        caught instanceof Error
          ? caught.message
          : "Не удалось повторить создание отправления Ozon"
      )
      window.location.reload()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Container className="flex flex-col gap-y-3 p-6">
      <Heading level="h2">Ошибка создания Ozon</Heading>
      <Text size="small" className="whitespace-pre-wrap break-words">
        {error}
      </Text>
      {diagnostics ? (
        <details className="text-ui-fg-subtle text-xs">
          <summary className="cursor-pointer">Диагностика ошибки</summary>
          <pre className="bg-ui-bg-subtle mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-all rounded-md p-3 font-mono">
            {diagnostics}
          </pre>
        </details>
      ) : null}
      <div className="flex flex-col gap-y-1">
        <Text size="small">Попыток: {attempts}</Text>
        <Text size="small" className="text-ui-fg-subtle">
          {retryAfter
            ? `Следующая автоматическая попытка: ${retryAfter}`
            : "Время следующей попытки не задано"}
        </Text>
      </div>
      {alreadyCreated ? (
        <Text size="small" className="text-ui-fg-subtle">
          Отправление уже создано; повтор отключён.
        </Text>
      ) : (
        <div className="flex flex-col gap-y-2">
          <Button
            variant="secondary"
            disabled={busy || canceled}
            onClick={() => createNow()}
          >
            {busy ? "Создаём…" : "Повторить обычный путь"}
          </Button>
          <Button
            disabled={busy || canceled}
            onClick={() => createNow("delivery_api")}
          >
            {busy ? "Создаём…" : "Создать через Delivery API"}
          </Button>
          <Text size="small" className="text-ui-fg-subtle">
            Delivery API создаёт отправление без артикула Ozon Seller. Выбранный
            ПВЗ должен быть доступен для настроенного метода доставки.
          </Text>
        </div>
      )}
      {canceled && !alreadyCreated ? (
        <Text size="small" className="text-ui-fg-subtle">
          Отменённый заказ нельзя отправить в Ozon.
        </Text>
      ) : null}
    </Container>
  )
}

export const config = defineWidgetConfig({
  zone: "order.details.side.after",
})

export default OrderOzonCreateErrorWidget
