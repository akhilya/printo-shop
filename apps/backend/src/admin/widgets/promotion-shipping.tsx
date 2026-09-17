import { defineWidgetConfig } from "@medusajs/admin-sdk"
import type { DetailWidgetProps, HttpTypes } from "@medusajs/types"
import { Container, Heading, Switch, Text, toast } from "@medusajs/ui"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { sdk } from "../lib/sdk"

const PromotionShippingWidget = ({
  data,
}: DetailWidgetProps<HttpTypes.AdminPromotion>) => {
  const queryClient = useQueryClient()
  const target = String(data.application_method?.target_type || "")
  const [includeShipping, setIncludeShipping] = useState(target === "order")

  const save = useMutation({
    mutationFn: (value: boolean) =>
      sdk.client.fetch(`/admin/shop-promotions/${data.id}`, {
        method: "POST",
        body: { include_shipping: value },
      }),
    onSuccess: (_result, value) => {
      setIncludeShipping(value)
      queryClient.invalidateQueries()
      toast.success(value ? "Скидка на весь заказ" : "Скидка только на товар")
    },
    onError: () => toast.error("Не удалось сохранить"),
  })

  return (
    <Container className="flex flex-col gap-y-3 p-6">
      <Heading level="h2">Доставка в скидке</Heading>
      <div className="flex items-center justify-between gap-x-4">
        <Text size="small" className="text-ui-fg-subtle">
          Выкл — только товар. Вкл — товар и доставка.
        </Text>
        <Switch
          checked={includeShipping}
          disabled={save.isPending}
          onCheckedChange={(checked) => save.mutate(checked === true)}
        />
      </div>
    </Container>
  )
}

export const config = defineWidgetConfig({
  zone: "promotion.details.side.after",
})

export default PromotionShippingWidget
