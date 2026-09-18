import { defineRouteConfig } from "@medusajs/admin-sdk"
import {
  Button,
  Container,
  Heading,
  Input,
  Label,
  Text,
  toast,
} from "@medusajs/ui"
import { useMutation, useQuery } from "@tanstack/react-query"
import { useState } from "react"
import { sdk } from "../../lib/sdk"
import type { ShopDevPurgeTarget } from "../../../lib/shop-dev-purge"

type PurgeCard = {
  target: ShopDevPurgeTarget
  title: string
  body: string
  action: string
}

const CARDS: PurgeCard[] = [
  {
    target: "orders",
    title: "Заказы",
    body: "Магазинные заказы, корзины, кастомные заявки и номера заказов.",
    action: "Удалить все заказы",
  },
  {
    target: "logs",
    title: "Логи",
    body: "Все события магазина: Ozon, письма, ошибки.",
    action: "Удалить все логи",
  },
  {
    target: "products",
    title: "Товары",
    body: "Каталог, коллекции, категории и остатки. Настройки и пользователи не трогаем.",
    action: "Удалить все товары",
  },
  {
    target: "rest",
    title: "Остальное",
    body: "Отзывы, баннеры и скидки. Юрдокументы и настройки магазина остаются.",
    action: "Удалить остальное",
  },
]

const PurgeForm = ({ card, enabled }: { card: PurgeCard; enabled: boolean }) => {
  const [password, setPassword] = useState("")
  const [secret, setSecret] = useState("")
  const [confirmed, setConfirmed] = useState(false)

  const run = useMutation({
    mutationFn: () =>
      sdk.client.fetch("/admin/shop-dev-purge", {
        method: "POST",
        body: {
          target: card.target,
          password,
          secret,
          confirmed,
        },
      }),
    onSuccess: () => {
      toast.success("Очистка выполнена")
      setPassword("")
      setSecret("")
      setConfirmed(false)
    },
    onError: (error: { message?: string }) => {
      toast.error(error.message || "Не удалось очистить")
    },
  })

  const ready = enabled && confirmed && password && secret && !run.isPending

  return (
    <Container className="flex flex-col gap-y-4 p-6">
      <Heading level="h2">{card.title}</Heading>
      <Text size="small" className="text-ui-fg-subtle">
        {card.body}
      </Text>
      <label className="flex items-start gap-x-2">
        <input
          type="checkbox"
          checked={confirmed}
          disabled={!enabled || run.isPending}
          onChange={(event) => setConfirmed(event.target.checked)}
        />
        <Text size="small">
          Удалить безвозвратно. Восстановить данные будет нельзя.
        </Text>
      </label>
      <div className="flex flex-col gap-y-2">
        <Label>Пароль администратора</Label>
        <Input
          type="password"
          autoComplete="off"
          value={password}
          disabled={!enabled}
          onChange={(event) => setPassword(event.target.value)}
        />
      </div>
      <div className="flex flex-col gap-y-2">
        <Label>Секрет из среды</Label>
        <Input
          type="password"
          autoComplete="off"
          value={secret}
          disabled={!enabled}
          onChange={(event) => setSecret(event.target.value)}
        />
      </div>
      <Button
        variant="danger"
        disabled={!ready}
        isLoading={run.isPending}
        onClick={() => run.mutate()}
      >
        {card.action}
      </Button>
    </Container>
  )
}

const ShopDevPage = () => {
  const { data, isLoading } = useQuery({
    queryFn: () =>
      sdk.client.fetch<{ enabled: boolean }>("/admin/shop-dev-purge"),
    queryKey: ["admin-shop-dev-purge"],
  })
  const enabled = data?.enabled === true

  return (
    <div className="flex flex-col gap-y-4">
      <Container className="flex flex-col gap-y-3 p-6">
        <Heading>Разработка</Heading>
        <Text size="small" className="text-ui-fg-subtle">
          Жёсткая очистка тестовых данных. Нужны пароль текущего администратора,
          секрет из среды и галочка на каждом действии.
        </Text>
        {isLoading ? (
          <Text size="small">Загрузка</Text>
        ) : enabled ? null : (
          <Text size="small" className="text-ui-fg-subtle">
            Инструменты выключены: задайте SHOP_DEV_PURGE_SECRET (от 16 символов)
            и перезапустите бэкенд.
          </Text>
        )}
      </Container>
      {CARDS.map((card) => (
        <PurgeForm key={card.target} card={card} enabled={enabled} />
      ))}
    </div>
  )
}

export const config = defineRouteConfig({
  label: "Разработка",
  nested: "/shop-service",
  rank: 5,
})

export default ShopDevPage
