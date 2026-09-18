import { defineRouteConfig } from "@medusajs/admin-sdk"
import { PencilSquare } from "@medusajs/icons"
import { Container, Heading, Text } from "@medusajs/ui"
import { Link } from "react-router-dom"

const LINKS = [
  { to: "/shop-issues", label: "Обращения", hint: "Письма после доставки" },
  {
    to: "/custom-orders",
    label: "Индивидуальные заказы",
    hint: "Заявки вне каталога",
  },
]

const ShopSalesPage = () => (
  <Container className="flex flex-col gap-y-4 p-6">
    <Heading>Заказы магазина</Heading>
    <Text size="small" className="text-ui-fg-subtle">
      Обращения по доставленным заказам и индивидуальные заявки. Обычные заказы
      — в разделе Заказы.
    </Text>
    <div className="flex flex-col gap-y-2">
      {LINKS.map((item) => (
        <Link key={item.to} to={item.to} className="text-ui-fg-interactive">
          {item.label}
          <span className="ml-2 text-ui-fg-subtle">{item.hint}</span>
        </Link>
      ))}
    </div>
  </Container>
)

export const config = defineRouteConfig({
  label: "Заказы магазина",
  icon: PencilSquare,
  rank: 2,
})

export default ShopSalesPage
