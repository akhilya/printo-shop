import { defineRouteConfig } from "@medusajs/admin-sdk"
import { CogSixTooth } from "@medusajs/icons"
import {
  Button,
  Container,
  Heading,
  Label,
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
}

const ShopSettingsPage = () => {
  const queryClient = useQueryClient()
  const [form, setForm] = useState<ShopSetting>({
    closed: false,
    message: "Магазин в разработке.",
  })

  const { data, isLoading } = useQuery({
    queryFn: () =>
      sdk.client.fetch<{ shop: ShopSetting }>("/admin/shop-settings"),
    queryKey: ["admin-shop-settings"],
  })

  useEffect(() => {
    if (!data?.shop) return
    setForm({
      closed: data.shop.closed === true,
      message: data.shop.message || "Магазин в разработке.",
    })
  }, [data])

  const save = useMutation({
    mutationFn: () =>
      sdk.client.fetch("/admin/shop-settings", {
        method: "POST",
        body: form,
      }),
    onSuccess: () => {
      toast.success("Настройки витрины сохранены")
      queryClient.invalidateQueries({ queryKey: ["admin-shop-settings"] })
    },
    onError: () => toast.error("Не удалось сохранить"),
  })

  return (
    <Container className="flex max-w-xl flex-col gap-y-4 p-6">
      <Heading>Витрина</Heading>
      <Text size="small" className="text-ui-fg-subtle">
        Если включить режим разработки, на сайте будет только сообщение — без
        каталога, корзины и подвала.
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
          <Button onClick={() => save.mutate()} isLoading={save.isPending}>
            Сохранить
          </Button>
        </>
      )}
    </Container>
  )
}

export const config = defineRouteConfig({
  label: "Витрина",
  icon: CogSixTooth,
})

export default ShopSettingsPage
