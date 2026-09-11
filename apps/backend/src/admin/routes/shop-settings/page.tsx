import { defineRouteConfig } from "@medusajs/admin-sdk"
import { CogSixTooth } from "@medusajs/icons"
import {
  Button,
  Container,
  Heading,
  Input,
  Label,
  Select,
  Switch,
  Text,
  Textarea,
  toast,
} from "@medusajs/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useState } from "react"
import { sdk } from "../../lib/sdk"

type ShopSetting = {
  closed: boolean
  message: string
  orders_closed: boolean
  orders_message: string
  tbank_terminal_key: string
  tbank_password_set: boolean
  tbank_api_url: string
  tbank_success_url: string
  tbank_fail_url: string
  tbank_notification_url: string
  tbank_pay_type: "O" | "T"
  tbank_receipt: boolean
  tbank_taxation: string
  tbank_vat: string
  ozon_client_id: string
  ozon_api_key: string
  ozon_api_key_set: boolean
  ozon_from_place_id: string
}

const EMPTY: ShopSetting = {
  closed: false,
  message: "Магазин в разработке.",
  orders_closed: false,
  orders_message: "Заказы временно недоступны.",
  tbank_terminal_key: "",
  tbank_password_set: false,
  tbank_api_url: "https://securepay.tinkoff.ru/v2",
  tbank_success_url: "",
  tbank_fail_url: "",
  tbank_notification_url: "",
  tbank_pay_type: "O",
  tbank_receipt: false,
  tbank_taxation: "usn_income",
  tbank_vat: "none",
  ozon_client_id: "",
  ozon_api_key: "",
  ozon_api_key_set: false,
  ozon_from_place_id: "",
}

const ShopSettingsPage = () => {
  const queryClient = useQueryClient()
  const [form, setForm] = useState({
    ...EMPTY,
    tbank_password: "",
  })

  const { data, isLoading } = useQuery({
    queryFn: () =>
      sdk.client.fetch<{ shop: ShopSetting }>("/admin/shop-settings"),
    queryKey: ["admin-shop-settings"],
  })

  useEffect(() => {
    if (!data?.shop) return
    setForm({
      ...EMPTY,
      ...data.shop,
      tbank_password: "",
      ozon_api_key: "",
    })
  }, [data])

  const save = useMutation({
    mutationFn: () =>
      sdk.client.fetch("/admin/shop-settings", {
        method: "POST",
        body: {
          closed: form.closed,
          message: form.message,
          orders_closed: form.orders_closed,
          orders_message: form.orders_message,
          tbank_terminal_key: form.tbank_terminal_key,
          tbank_password: form.tbank_password,
          tbank_api_url: form.tbank_api_url,
          tbank_success_url: form.tbank_success_url,
          tbank_fail_url: form.tbank_fail_url,
          tbank_notification_url: form.tbank_notification_url,
          tbank_pay_type: form.tbank_pay_type,
          tbank_receipt: form.tbank_receipt,
          tbank_taxation: form.tbank_taxation,
          tbank_vat: form.tbank_vat,
          ozon_client_id: form.ozon_client_id,
          ozon_api_key: form.ozon_api_key,
          ozon_from_place_id: form.ozon_from_place_id,
        },
      }),
    onSuccess: () => {
      toast.success("Настройки сохранены")
      queryClient.invalidateQueries({ queryKey: ["admin-shop-settings"] })
    },
    onError: () => toast.error("Не удалось сохранить"),
  })

  return (
    <div className="flex flex-col gap-y-4">
      <Container className="flex max-w-xl flex-col gap-y-4 p-6">
        <Heading>Витрина</Heading>
        <Text size="small" className="text-ui-fg-subtle">
          Режим разработки скрывает каталог. Отдельный переключатель оставляет
          витрину открытой, но запрещает оплату и заявки.
        </Text>
        {isLoading ? (
          <Text>Загрузка</Text>
        ) : (
          <>
            <div className="flex items-center gap-x-2">
              <Switch
                checked={form.closed}
                onCheckedChange={(value) =>
                  setForm((current) => ({ ...current, closed: Boolean(value) }))
                }
              />
              <Label>
                {form.closed ? "Режим разработки включён" : "Витрина открыта"}
              </Label>
            </div>
            <div className="flex flex-col gap-y-2">
              <Label>Сообщение на сайте</Label>
              <Textarea
                rows={3}
                value={form.message}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    message: event.target.value,
                  }))
                }
              />
            </div>
            <div className="flex items-center gap-x-2">
              <Switch
                checked={form.orders_closed}
                onCheckedChange={(value) =>
                  setForm((current) => ({
                    ...current,
                    orders_closed: Boolean(value),
                  }))
                }
              />
              <Label>
                {form.orders_closed
                  ? "Заказы и оплата выключены"
                  : "Заказы принимаются"}
              </Label>
            </div>
            <div className="flex flex-col gap-y-2">
              <Label>Сообщение, если заказы выключены</Label>
              <Textarea
                rows={2}
                value={form.orders_message}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    orders_message: event.target.value,
                  }))
                }
              />
            </div>
          </>
        )}
      </Container>

      <Container className="flex max-w-xl flex-col gap-y-4 p-6">
        <Heading>Т-Банк</Heading>
        <Text size="small" className="text-ui-fg-subtle">
          Ключ и пароль терминала. Пустой пароль при сохранении не затирает
          уже сохранённый.
        </Text>
        {isLoading ? null : (
          <>
            <div className="flex flex-col gap-y-2">
              <Label>Terminal Key</Label>
              <Input
                value={form.tbank_terminal_key}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    tbank_terminal_key: event.target.value,
                  }))
                }
              />
            </div>
            <div className="flex flex-col gap-y-2">
              <Label>Пароль терминала</Label>
              <Input
                type="password"
                autoComplete="new-password"
                placeholder={
                  form.tbank_password_set ? "Сохранён, введите чтобы сменить" : ""
                }
                value={form.tbank_password}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    tbank_password: event.target.value,
                  }))
                }
              />
            </div>
            <div className="flex flex-col gap-y-2">
              <Label>API</Label>
              <Select
                value={form.tbank_api_url}
                onValueChange={(value) =>
                  setForm((current) => ({ ...current, tbank_api_url: value }))
                }
              >
                <Select.Trigger>
                  <Select.Value />
                </Select.Trigger>
                <Select.Content>
                  <Select.Item value="https://securepay.tinkoff.ru/v2">
                    securepay.tinkoff.ru (DEMO и боевой терминал)
                  </Select.Item>
                  <Select.Item value="https://rest-api-test.tinkoff.ru/v2">
                    rest-api-test (403 без белого списка IP — магазин уйдёт на securepay)
                  </Select.Item>
                </Select.Content>
              </Select>
              <Text size="small" className="text-ui-fg-subtle">
                rest-api-test.tinkoff.ru отвечает 403, пока Т-Банк не внесёт IP
                сервера в белый список. DEMO-терминал и обычный тестовый ключ
                работают через securepay.tinkoff.ru.
              </Text>
            </div>
            <div className="flex flex-col gap-y-2">
              <Label>Тип оплаты</Label>
              <Select
                value={form.tbank_pay_type}
                onValueChange={(value) =>
                  setForm((current) => ({
                    ...current,
                    tbank_pay_type: value === "T" ? "T" : "O",
                  }))
                }
              >
                <Select.Trigger>
                  <Select.Value />
                </Select.Trigger>
                <Select.Content>
                  <Select.Item value="O">Одностадийная (O)</Select.Item>
                  <Select.Item value="T">Двухстадийная (T)</Select.Item>
                </Select.Content>
              </Select>
            </div>
            <div className="flex items-center gap-x-2">
              <Switch
                checked={form.tbank_receipt}
                onCheckedChange={(value) =>
                  setForm((current) => ({
                    ...current,
                    tbank_receipt: Boolean(value),
                  }))
                }
              />
              <Label>Передавать чек (54-ФЗ)</Label>
            </div>
            <div className="flex flex-col gap-y-2">
              <Label>Система налогообложения</Label>
              <Select
                value={form.tbank_taxation}
                onValueChange={(value) =>
                  setForm((current) => ({
                    ...current,
                    tbank_taxation: value,
                  }))
                }
              >
                <Select.Trigger>
                  <Select.Value />
                </Select.Trigger>
                <Select.Content>
                  <Select.Item value="osn">ОСН</Select.Item>
                  <Select.Item value="usn_income">УСН доходы</Select.Item>
                  <Select.Item value="usn_income_outcome">
                    УСН доходы минус расходы
                  </Select.Item>
                  <Select.Item value="envd">ЕНВД</Select.Item>
                  <Select.Item value="esn">ЕСН</Select.Item>
                  <Select.Item value="patent">Патент</Select.Item>
                </Select.Content>
              </Select>
            </div>
            <div className="flex flex-col gap-y-2">
              <Label>НДС</Label>
              <Select
                value={form.tbank_vat}
                onValueChange={(value) =>
                  setForm((current) => ({ ...current, tbank_vat: value }))
                }
              >
                <Select.Trigger>
                  <Select.Value />
                </Select.Trigger>
                <Select.Content>
                  <Select.Item value="none">Без НДС</Select.Item>
                  <Select.Item value="vat0">НДС 0%</Select.Item>
                  <Select.Item value="vat5">НДС 5%</Select.Item>
                  <Select.Item value="vat7">НДС 7%</Select.Item>
                  <Select.Item value="vat10">НДС 10%</Select.Item>
                  <Select.Item value="vat20">НДС 20%</Select.Item>
                  <Select.Item value="vat22">НДС 22%</Select.Item>
                </Select.Content>
              </Select>
            </div>
            <div className="flex flex-col gap-y-2">
              <Label>Success URL</Label>
              <Input
                value={form.tbank_success_url}
                placeholder="https://shop.example.com/checkout/success"
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    tbank_success_url: event.target.value,
                  }))
                }
              />
            </div>
            <div className="flex flex-col gap-y-2">
              <Label>Fail URL</Label>
              <Input
                value={form.tbank_fail_url}
                placeholder="https://shop.example.com/checkout/fail"
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    tbank_fail_url: event.target.value,
                  }))
                }
              />
            </div>
            <div className="flex flex-col gap-y-2">
              <Label>Notification URL</Label>
              <Input
                value={form.tbank_notification_url}
                placeholder="https://api.example.com/hooks/tbank"
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    tbank_notification_url: event.target.value,
                  }))
                }
              />
            </div>
            <Button onClick={() => save.mutate()} isLoading={save.isPending}>
              Сохранить
            </Button>
          </>
        )}
      </Container>

      <Container className="flex max-w-xl flex-col gap-y-4 p-6">
        <Heading>Ozon Доставка</Heading>
        <Text size="small" className="text-ui-fg-subtle">
          Пока только ПВЗ. Client-Id и Api-Key из кабинета Ozon после
          подключения доставки. Для Rocket Client-Id начинается с Principal_.
          Пустой ключ не затирает сохранённый.
        </Text>
        {isLoading ? null : (
          <>
            <div className="flex flex-col gap-y-2">
              <Label>Client-Id</Label>
              <Input
                value={form.ozon_client_id}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    ozon_client_id: event.target.value,
                  }))
                }
              />
            </div>
            <div className="flex flex-col gap-y-2">
              <Label>Api-Key</Label>
              <Input
                type="password"
                value={form.ozon_api_key}
                placeholder={form.ozon_api_key_set ? "Ключ сохранён" : ""}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    ozon_api_key: event.target.value,
                  }))
                }
              />
            </div>
            <div className="flex flex-col gap-y-2">
              <Label>From place id (склад сдачи)</Label>
              <Input
                value={form.ozon_from_place_id}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    ozon_from_place_id: event.target.value,
                  }))
                }
              />
            </div>
            <Button onClick={() => save.mutate()} isLoading={save.isPending}>
              Сохранить
            </Button>
          </>
        )}
      </Container>
    </div>
  )
}

export const config = defineRouteConfig({
  label: "Настройки",
  icon: CogSixTooth,
})

export default ShopSettingsPage
