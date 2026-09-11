import { defineWidgetConfig } from "@medusajs/admin-sdk"
import type { DetailWidgetProps, HttpTypes } from "@medusajs/types"
import { Button, Container, Heading, Text, toast } from "@medusajs/ui"
import { useState } from "react"
import { sdk } from "../lib/sdk"

const LABEL: Record<string, string> = {
  awaiting_pack: "В сборке",
  awaiting_deliver: "Собран",
  delivering: "Доставляется",
  delivered: "Доставлен",
}

const OrderFulfillmentWidget = ({
  data,
}: DetailWidgetProps<HttpTypes.AdminOrder>) => {
  const [busy, setBusy] = useState<string | null>(null)
  const canceled = data.status === "canceled"
  const metadata = (data.metadata || {}) as Record<string, unknown>
  const fulfillment = String(metadata.shop_fulfillment || "awaiting_pack")
  const paid = data.status === "completed" || data.status === "archived"

  async function run(action: string) {
    setBusy(action)
    try {
      await sdk.client.fetch(`/admin/shop-orders/${data.id}/fulfill`, {
        method: "POST",
        body: { action },
      })
      toast.success("Статус заказа обновлён")
      window.location.reload()
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Не удалось обновить статус"
      )
    } finally {
      setBusy(null)
    }
  }

  if (canceled || !paid) return null

  return (
    <Container className="flex flex-col gap-y-3 p-6">
      <Heading level="h2">Сборка и доставка</Heading>
      <Text size="small">
        {LABEL[fulfillment] || "В сборке"}
      </Text>
      <div className="flex flex-wrap gap-2">
        <Button
          size="small"
          variant="secondary"
          disabled={Boolean(busy) || fulfillment === "awaiting_deliver" || fulfillment === "delivering" || fulfillment === "delivered"}
          onClick={() => run("pack")}
        >
          {busy === "pack" ? "…" : "Собран"}
        </Button>
        <Button
          size="small"
          variant="secondary"
          disabled={Boolean(busy) || fulfillment === "delivering" || fulfillment === "delivered"}
          onClick={() => run("ship")}
        >
          {busy === "ship" ? "…" : "Отдан в доставку"}
        </Button>
        <Button
          size="small"
          variant="secondary"
          disabled={Boolean(busy) || fulfillment === "delivered"}
          onClick={() => run("deliver")}
        >
          {busy === "deliver" ? "…" : "Доставлен"}
        </Button>
      </div>
    </Container>
  )
}

export const config = defineWidgetConfig({
  zone: "order.details.side.after",
})

export default OrderFulfillmentWidget
