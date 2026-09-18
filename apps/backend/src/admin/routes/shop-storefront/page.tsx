import { defineRouteConfig } from "@medusajs/admin-sdk"
import { Photo } from "@medusajs/icons"
import { Container, Heading, Text } from "@medusajs/ui"
import { Link } from "react-router-dom"

const LINKS = [
  { to: "/banners", label: "Баннеры", hint: "Главная, карточка, удача" },
  { to: "/shop-promotions", label: "Скидки", hint: "Промокоды витрины" },
  { to: "/legal-pages", label: "Документы", hint: "Оферта и возврат" },
  { to: "/reviews", label: "Отзывы", hint: "Модерация" },
  { to: "/shop-collections", label: "Карточки коллекций", hint: "Лицевое фото" },
]

const ShopStorefrontPage = () => (
  <Container className="flex flex-col gap-y-4 p-6">
    <Heading>Витрина</Heading>
    <Text size="small" className="text-ui-fg-subtle">
      Страницы магазина, которые видит покупатель.
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
  label: "Витрина",
  icon: Photo,
  rank: 1,
})

export default ShopStorefrontPage
