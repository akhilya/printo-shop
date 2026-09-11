import { defineWidgetConfig } from "@medusajs/admin-sdk"
import type { DetailWidgetProps, HttpTypes } from "@medusajs/types"
import { Container, Heading, Text } from "@medusajs/ui"

const OrderNumberWidget = ({
  data,
}: DetailWidgetProps<HttpTypes.AdminOrder>) => {
  const metadata = (data.metadata || {}) as Record<string, unknown>
  const number = String(metadata.shop_number || "").trim()
  return (
    <Container className="p-6">
      <Heading level="h2">Номер заказа</Heading>
      <Text>
        {/^\d{10}$/.test(number) ? number : "Появится после оплаты"}
      </Text>
      {/^\d{10}$/.test(number) ? (
        <Text size="small" className="text-ui-fg-subtle">
          Страница для клиента: /order/{number}
        </Text>
      ) : (
        <Text size="small" className="text-ui-fg-subtle">
          В списке Medusa по-прежнему короткий # — клиенту уходит 10-значный.
        </Text>
      )}
    </Container>
  )
}

export const config = defineWidgetConfig({
  zone: "order.details.side.after",
})

export default OrderNumberWidget
