import { defineRouteConfig } from "@medusajs/admin-sdk"
import {
  Badge,
  Button,
  Container,
  Heading,
  Input,
  Label,
  Select,
  Switch,
  Text,
  toast,
} from "@medusajs/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useState } from "react"
import { sdk } from "../../lib/sdk"
import { promotionUsesLabel } from "../../../lib/shop-promotion"

type ShopPromotion = {
  id: string
  code: string
  is_automatic: boolean
  status: string
  type: "percentage" | "fixed"
  value: number
  include_shipping: boolean
  used_count: number
  max_uses: number
  page: string
  gift_card: boolean
}

const EMPTY = {
  code: "",
  type: "percentage" as "percentage" | "fixed",
  value: "10",
  max_uses: "0",
  include_shipping: false,
  is_automatic: false,
}

const ShopPromotionsPage = () => {
  const queryClient = useQueryClient()
  const [form, setForm] = useState(EMPTY)
  const [link, setLink] = useState({ path: "", target: "" })

  const linkQuery = useQuery({
    queryFn: () =>
      sdk.client.fetch<{ link: { path: string; target: string } }>(
        "/admin/shop-link"
      ),
    queryKey: ["admin-shop-link"],
  })

  const { data, isLoading } = useQuery({
    queryFn: () =>
      sdk.client.fetch<{ promotions: ShopPromotion[] }>(
        "/admin/shop-promotions"
      ),
    queryKey: ["admin-shop-promotions"],
  })

  const saveLink = useMutation({
    mutationFn: () =>
      sdk.client.fetch("/admin/shop-link", {
        method: "POST",
        body: link,
      }),
    onSuccess: () => {
      toast.success("Ссылка сохранена")
      queryClient.invalidateQueries({ queryKey: ["admin-shop-link"] })
    },
    onError: (error: { message?: string }) => {
      toast.error(error.message || "Не удалось сохранить ссылку")
    },
  })

  const create = useMutation({
    mutationFn: () =>
      sdk.client.fetch("/admin/shop-promotions", {
        method: "POST",
        body: {
          code: form.code,
          type: form.type,
          value: Number(form.value),
          max_uses: Number(form.max_uses),
          include_shipping: form.include_shipping,
          is_automatic: form.is_automatic,
        },
      }),
    onSuccess: () => {
      toast.success("Скидка создана")
      setForm(EMPTY)
      queryClient.invalidateQueries({ queryKey: ["admin-shop-promotions"] })
    },
    onError: (error: { message?: string }) => {
      toast.error(error.message || "Не удалось создать скидку")
    },
  })

  const toggleShipping = useMutation({
    mutationFn: (row: ShopPromotion) =>
      sdk.client.fetch(`/admin/shop-promotions/${row.id}`, {
        method: "POST",
        body: { include_shipping: !row.include_shipping },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-shop-promotions"] })
    },
    onError: () => toast.error("Не удалось сохранить"),
  })

  const toggleStatus = useMutation({
    mutationFn: (row: ShopPromotion) =>
      sdk.client.fetch(`/admin/shop-promotions/${row.id}`, {
        method: "POST",
        body: {
          status: row.status === "active" ? "inactive" : "active",
        },
      }),
    onSuccess: (_result, row) => {
      queryClient.invalidateQueries({ queryKey: ["admin-shop-promotions"] })
      toast.success(
        row.status === "active" ? "Скидка выключена" : "Скидка включена"
      )
    },
    onError: () => toast.error("Не удалось сохранить"),
  })

  useEffect(() => {
    if (!linkQuery.data?.link) return
    setLink({
      path: linkQuery.data.link.path || "",
      target: linkQuery.data.link.target || "",
    })
  }, [linkQuery.data])

  const rows = data?.promotions || []

  return (
    <div className="flex flex-col gap-y-4">
      <Container className="flex flex-col gap-y-4 p-6">
        <Heading>Ссылка</Heading>
        <Text size="small" className="text-ui-fg-subtle">
          Один адрес для QR-кода. Открывает промокод или другую страницу магазина.
        </Text>
        <form
          className="flex max-w-md flex-col gap-y-3"
          onSubmit={(event) => {
            event.preventDefault()
            saveLink.mutate()
          }}
        >
          <div className="flex flex-col gap-y-2">
            <Label>Путь</Label>
            <Input
              value={link.path}
              onChange={(event) =>
                setLink((current) => ({ ...current, path: event.target.value }))
              }
              placeholder="/akcia"
            />
          </div>
          <div className="flex flex-col gap-y-2">
            <Label>Куда вести</Label>
            <Input
              value={link.target}
              onChange={(event) =>
                setLink((current) => ({
                  ...current,
                  target: event.target.value,
                }))
              }
              placeholder="/products"
            />
          </div>
          <Button type="submit" isLoading={saveLink.isPending}>
            Сохранить
          </Button>
        </form>
      </Container>
      <Container className="flex flex-col gap-y-4 p-6">
        <Heading>Скидки</Heading>
        <Text size="small" className="text-ui-fg-subtle">
          Промокод на товары или на весь заказ вместе с доставкой.
        </Text>
        <form
          className="flex max-w-md flex-col gap-y-3"
          onSubmit={(event) => {
            event.preventDefault()
            create.mutate()
          }}
        >
          <div className="flex flex-col gap-y-2">
            <Label>Код</Label>
            <Input
              value={form.code}
              onChange={(event) =>
                setForm((current) => ({ ...current, code: event.target.value }))
              }
              placeholder="LETO10"
            />
          </div>
          <div className="flex flex-col gap-y-2">
            <Label>Тип</Label>
            <Select
              value={form.type}
              onValueChange={(value) =>
                setForm((current) => ({
                  ...current,
                  type: value === "fixed" ? "fixed" : "percentage",
                }))
              }
            >
              <Select.Trigger>
                <Select.Value />
              </Select.Trigger>
              <Select.Content>
                <Select.Item value="percentage">Процент</Select.Item>
                <Select.Item value="fixed">Фиксированная сумма</Select.Item>
              </Select.Content>
            </Select>
          </div>
          <div className="flex flex-col gap-y-2">
            <Label>{form.type === "fixed" ? "Сумма, ₽" : "Процент"}</Label>
            <Input
              type="number"
              min={1}
              max={form.type === "percentage" ? 100 : undefined}
              value={form.value}
              onChange={(event) =>
                setForm((current) => ({ ...current, value: event.target.value }))
              }
            />
          </div>
          <div className="flex flex-col gap-y-2">
            <Label>Макс. применений</Label>
            <Input
              type="number"
              min={0}
              step={1}
              value={form.max_uses}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  max_uses: event.target.value,
                }))
              }
            />
            <Text size="small" className="text-ui-fg-subtle">
              0 — без ограничения
            </Text>
          </div>
          <div className="flex items-center justify-between gap-x-4">
            <div>
              <Label>Учитывать доставку</Label>
              <Text size="small" className="text-ui-fg-subtle">
                Выкл — скидка только на товар. Вкл — на весь заказ.
              </Text>
            </div>
            <Switch
              checked={form.include_shipping}
              onCheckedChange={(checked) =>
                setForm((current) => ({
                  ...current,
                  include_shipping: checked === true,
                }))
              }
            />
          </div>
          <div className="flex items-center justify-between gap-x-4">
            <div>
              <Label>Сама применяется</Label>
              <Text size="small" className="text-ui-fg-subtle">
                Без промокода, на витрине.
              </Text>
            </div>
            <Switch
              checked={form.is_automatic}
              onCheckedChange={(checked) =>
                setForm((current) => ({
                  ...current,
                  is_automatic: checked === true,
                }))
              }
            />
          </div>
          <Button type="submit" isLoading={create.isPending}>
            Создать
          </Button>
        </form>
      </Container>
      <Container className="divide-y p-0">
        <div className="px-6 py-4">
          <Heading level="h2">Список</Heading>
        </div>
        <div className="px-6 py-4">
          {isLoading ? (
            <Text>Загрузка</Text>
          ) : rows.length === 0 ? (
            <Text size="small" className="text-ui-fg-subtle">
              Пока нет скидок
            </Text>
          ) : (
            <div className="flex flex-col gap-y-3">
              {rows.map((row) => (
                <div
                  key={row.id}
                  className="flex flex-col gap-y-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <Text weight="plus">{row.code}</Text>
                    {!row.is_automatic && row.page ? (
                      <Text size="small" className="text-ui-fg-subtle">
                        Страница /a/{row.page}
                      </Text>
                    ) : null}
                    <Text size="small" className="text-ui-fg-subtle">
                      {row.type === "fixed"
                        ? `${row.value} ₽`
                        : `${row.value} %`}
                      {row.is_automatic ? " · сама" : ""}
                      {" · "}
                      {promotionUsesLabel(row.used_count, row.max_uses)}
                    </Text>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                    <div className="flex items-center gap-x-2">
                      <Text size="small" className="text-ui-fg-subtle">
                        Включена
                      </Text>
                      <Switch
                        checked={row.status === "active"}
                        onCheckedChange={() => toggleStatus.mutate(row)}
                        disabled={toggleStatus.isPending}
                      />
                    </div>
                    <div className="flex items-center gap-x-2">
                      {row.gift_card ? <Badge color="purple">Сертификат</Badge> : null}
                      <Badge color={row.include_shipping ? "blue" : "grey"}>
                        {row.include_shipping ? "С доставкой" : "Только товар"}
                      </Badge>
                      <Switch
                        checked={row.include_shipping}
                        onCheckedChange={() => toggleShipping.mutate(row)}
                        disabled={toggleShipping.isPending}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Container>
    </div>
  )
}

export const config = defineRouteConfig({
  label: "Скидки",
  nested: "/products",
  rank: 2,
})

export default ShopPromotionsPage
