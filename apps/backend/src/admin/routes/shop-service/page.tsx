import { defineRouteConfig } from "@medusajs/admin-sdk"
import { CogSixTooth } from "@medusajs/icons"
import { Container, Heading, Text } from "@medusajs/ui"
import { Link } from "react-router-dom"

const LINKS = [
  { to: "/shop-settings", label: "Настройки", hint: "Озон, Т-Банк, витрина" },
  { to: "/delegat", label: "Делегат", hint: "Мост каталога" },
  { to: "/shop-logs", label: "Логи", hint: "Ozon, почта, ошибки" },
  { to: "/blocked-ips", label: "Блоклист IP", hint: "Спам и атаки" },
  { to: "/shop-dev", label: "Разработка", hint: "Очистка данных" },
]

const ShopServicePage = () => (
  <Container className="flex flex-col gap-y-4 p-6">
    <Heading>Сервис</Heading>
    <Text size="small" className="text-ui-fg-subtle">
      Служебные страницы магазина.
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
  label: "Сервис",
  icon: CogSixTooth,
  rank: 3,
})

export default ShopServicePage
