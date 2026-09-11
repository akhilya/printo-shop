import { defineWidgetConfig } from "@medusajs/admin-sdk"
import type { DetailWidgetProps, HttpTypes } from "@medusajs/types"
import { Button, Container, Heading, Switch, Text, toast } from "@medusajs/ui"
import { useState } from "react"
import { sdk } from "../lib/sdk"

const OrderCancelRefundWidget = ({
  data,
}: DetailWidgetProps<HttpTypes.AdminOrder>) => {
  const [refund, setRefund] = useState(true)
  const [busy, setBusy] = useState(false)
  const canceled = data.status === "canceled"

  async function onCancel() {
    setBusy(true)
    try {
      await sdk.client.fetch(`/admin/shop-orders/${data.id}/cancel`, {
        method: "POST",
        body: { refund },
      })
      toast.success(
        refund ? "Заказ отменён, оплата возвращена" : "Заказ отменён"
      )
      window.location.reload()
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Не удалось отменить заказ"
      )
    } finally {
      setBusy(false)
    }
  }

  if (canceled) {
    return (
      <Container className="p-6">
        <Heading level="h2">Отмена</Heading>
        <Text size="small" className="text-ui-fg-subtle">
          Заказ уже отменён.
        </Text>
      </Container>
    )
  }

  return (
    <Container className="flex flex-col gap-y-4 p-6">
      <Heading level="h2">Отмена и возврат</Heading>
      <div className="flex items-center gap-x-2">
        <Switch checked={refund} onCheckedChange={(value) => setRefund(Boolean(value))} />
        <Text size="small">Вернуть оплату в Т-Банк</Text>
      </div>
      <Text size="small" className="text-ui-fg-subtle">
        Галочка вызывает Cancel в Т-Банке по чеку заказа. Без галочки заказ
        только отменяется в Medusa.
      </Text>
      <Button
        variant="danger"
        disabled={busy}
        onClick={onCancel}
      >
        {busy ? "Отмена…" : "Отменить заказ"}
      </Button>
    </Container>
  )
}

export const config = defineWidgetConfig({
  zone: "order.details.side",
})

export default OrderCancelRefundWidget
