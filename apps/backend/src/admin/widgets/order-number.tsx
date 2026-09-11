import { defineWidgetConfig } from "@medusajs/admin-sdk"
import type { DetailWidgetProps, HttpTypes } from "@medusajs/types"
import { Container, Heading, Text } from "@medusajs/ui"

const OrderNumberWidget = ({
  data,
}: DetailWidgetProps<HttpTypes.AdminOrder>) => {
  const metadata = (data.metadata || {}) as Record<string, unknown>
  const number = String(metadata.shop_number || "").trim()
  if (!/^\d{10}$/.test(number)) return null
  return (
    <Container className="p-6">
      <Heading level="h2">Номер заказа</Heading>
      <Text>{number}</Text>
      <Text size="small" className="text-ui-fg-subtle">
        Страница для клиента: /order/{number}
      </Text>
    </Container>
  )
}

export const config = defineWidgetConfig({
  zone: "order.details.side.after",
})

export default OrderNumberWidget
