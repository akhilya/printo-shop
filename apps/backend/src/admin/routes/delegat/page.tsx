import { defineRouteConfig } from "@medusajs/admin-sdk"
import {
  Badge,
  Button,
  Container,
  Heading,
  Text,
  toast,
} from "@medusajs/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { sdk } from "../../lib/sdk"

type DelegatStatus = {
  success: boolean
  store_name: string
  medusa_version: string
  api_version: string
  api_base_url: string
  capabilities: string[]
  products: number
  collections: number
  categories: number
  api_keys: Array<{ id: string; title: string; created_at?: string }>
}

const DelegatPage = () => {
  const queryClient = useQueryClient()
  const [freshToken, setFreshToken] = useState("")

  const { data, isLoading, isError } = useQuery({
    queryFn: () => sdk.client.fetch<DelegatStatus>("/admin/delegat/status"),
    queryKey: ["admin-delegat-status"],
  })

  const createKey = useMutation({
    mutationFn: () =>
      sdk.client.fetch<{ key: { id: string; title: string; token: string } }>(
        "/admin/delegat/api-key",
        { method: "POST" }
      ),
    onSuccess: (payload) => {
      setFreshToken(payload.key.token)
      toast.success("Ключ создан — скопируйте его сейчас")
      queryClient.invalidateQueries({ queryKey: ["admin-delegat-status"] })
    },
    onError: () => toast.error("Не удалось создать ключ"),
  })

  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value)
      toast.success("Скопировано")
    } catch {
      toast.error("Не удалось скопировать")
    }
  }

  return (
    <div className="flex flex-col gap-y-4">
      <Container className="flex max-w-xl flex-col gap-y-4 p-6">
        <div className="flex items-center justify-between gap-x-3">
          <Heading>Делегат</Heading>
          {data?.success ? (
            <Badge color="green">Мост отвечает</Badge>
          ) : isLoading ? (
            <Badge color="grey">Загрузка</Badge>
          ) : (
            <Badge color="red">Нет ответа</Badge>
          )}
        </div>
        <Text size="small" className="text-ui-fg-subtle">
          Delegat.Module шлёт каталог на этот мост. URL берётся с адреса, с
          которого открыта админка. В PIM укажите его и секретный API-ключ.
        </Text>
        {isLoading ? (
          <Text>Загрузка</Text>
        ) : isError ? (
          <Text>Не удалось получить статус моста</Text>
        ) : (
          <>
            <div className="flex flex-col gap-y-1">
              <Text size="small" weight="plus">
                URL моста
              </Text>
              <div className="flex items-center gap-x-2">
                <Text size="small">{data?.api_base_url}</Text>
                <Button
                  size="small"
                  variant="secondary"
                  onClick={() => copy(data?.api_base_url || "")}
                >
                  Копировать
                </Button>
              </div>
            </div>
            <Text size="small">
              Магазин: {data?.store_name}. Товаров {data?.products}, коллекций{" "}
              {data?.collections}, категорий {data?.categories}.
            </Text>
          </>
        )}
      </Container>

      <Container className="flex max-w-xl flex-col gap-y-4 p-6">
        <Heading>API-ключ</Heading>
        <Text size="small" className="text-ui-fg-subtle">
          Секретный ключ показывается один раз при создании. Дальше его можно
          отозвать в Settings → Developer → Secret API Keys.
        </Text>
        {data?.api_keys?.length ? (
          <div className="flex flex-col gap-y-2">
            {data.api_keys.map((key) => (
              <Text key={key.id} size="small">
                {key.title || "Secret"}{" "}
                <span className="text-ui-fg-subtle">{key.id}</span>
              </Text>
            ))}
          </div>
        ) : (
          <Text size="small" className="text-ui-fg-subtle">
            Активных секретных ключей нет
          </Text>
        )}
        {freshToken ? (
          <div className="flex flex-col gap-y-2">
            <Text size="small" weight="plus">
              Новый ключ — сохраните
            </Text>
            <Text size="small">{freshToken}</Text>
            <Button
              size="small"
              variant="secondary"
              onClick={() => copy(freshToken)}
            >
              Копировать ключ
            </Button>
          </div>
        ) : null}
        <Button
          onClick={() => createKey.mutate()}
          isLoading={createKey.isPending}
        >
          Создать ключ Delegat
        </Button>
      </Container>
    </div>
  )
}

export const config = defineRouteConfig({
  label: "Делегат",
  nested: "/shop-service",
  rank: 2,
})

export default DelegatPage
