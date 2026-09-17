import { defineWidgetConfig } from "@medusajs/admin-sdk"
import type { DetailWidgetProps, HttpTypes } from "@medusajs/types"
import {
  Button,
  Container,
  FocusModal,
  Heading,
  Label,
  Select,
  Switch,
  Text,
  Textarea,
  toast,
} from "@medusajs/ui"
import { useState } from "react"
import { sdk } from "../lib/sdk"

const REASONS = [
  { value: "out_of_stock", label: "Товара нет в наличии" },
  { value: "cannot_deliver", label: "Не получилось оформить доставку" },
  { value: "order_error", label: "В заказе ошибка" },
  { value: "customer_request", label: "Отменили по вашей просьбе" },
  { value: "other", label: "Другая причина" },
]

const OrderCancelRefundWidget = ({
  data,
}: DetailWidgetProps<HttpTypes.AdminOrder>) => {
  const [refund, setRefund] = useState(true)
  const [reason, setReason] = useState("out_of_stock")
  const [note, setNote] = useState("")
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const canceled = data.status === "canceled"
  const reasonLabel =
    REASONS.find((item) => item.value === reason)?.label || REASONS[0].label

  async function onConfirm() {
    if (reason === "other" && !note.trim()) {
      toast.error("Напишите причину отмены")
      return
    }
    setBusy(true)
    try {
      await sdk.client.fetch(`/admin/shop-orders/${data.id}/cancel`, {
        method: "POST",
        body: { refund, reason, note: note.trim() },
      })
      toast.success(
        refund ? "Заказ отменён, оплата возвращена" : "Заказ отменён"
      )
      setOpen(false)
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
      <Text size="small" className="text-ui-fg-subtle">
        Причина уйдёт покупателю письмом. Без подтверждения заказ не
        отменится.
      </Text>
      <FocusModal open={open} onOpenChange={setOpen}>
        <FocusModal.Trigger asChild>
          <Button variant="danger">Отменить заказ</Button>
        </FocusModal.Trigger>
        <FocusModal.Content>
          <FocusModal.Header>
            <FocusModal.Title>Отменить заказ</FocusModal.Title>
          </FocusModal.Header>
          <FocusModal.Body className="flex flex-col gap-y-4 px-6 py-4">
            <div className="flex flex-col gap-y-2">
              <Label>Причина для покупателя</Label>
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
            <div className="flex flex-col gap-y-2">
              <Label>
                {reason === "other" ? "Текст причины" : "Комментарий"}
              </Label>
              <Textarea
                rows={4}
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Этот текст тоже уйдёт в письме"
              />
            </div>
            <div className="flex items-center gap-x-2">
              <Switch
                checked={refund}
                onCheckedChange={(value) => setRefund(Boolean(value))}
              />
              <Text size="small">Вернуть оплату в Т-Банк</Text>
            </div>
            <Text size="small" className="text-ui-fg-subtle">
              Покупатель получит: {reasonLabel}
              {note.trim() ? `. ${note.trim()}` : ""}
            </Text>
          </FocusModal.Body>
          <FocusModal.Footer>
            <FocusModal.Close asChild>
              <Button variant="secondary">Назад</Button>
            </FocusModal.Close>
            <Button
              variant="danger"
              disabled={busy}
              onClick={onConfirm}
            >
              {busy ? "Отмена…" : "Подтвердить отмену"}
            </Button>
          </FocusModal.Footer>
        </FocusModal.Content>
      </FocusModal>
    </Container>
  )
}

export const config = defineWidgetConfig({
  zone: "order.details.side",
})

export default OrderCancelRefundWidget
