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
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { sdk } from "../../lib/sdk"

type BlockedIp = {
  id: string
  ip: string
  reason: string | null
  created_at?: string
}

const BlockedIpsPage = () => {
  const queryClient = useQueryClient()
  const [ip, setIp] = useState("")
  const [reason, setReason] = useState("")

  const { data, isLoading } = useQuery({
    queryFn: () =>
      sdk.client.fetch<{ blocked_ips: BlockedIp[] }>("/admin/blocked-ips", {
        query: { limit: 100, offset: 0 },
      }),
    queryKey: ["admin-blocked-ips"],
  })

  const add = useMutation({
    mutationFn: () =>
      sdk.client.fetch("/admin/blocked-ips", {
        method: "POST",
        body: { ip, reason },
      }),
    onSuccess: () => {
      toast.success("Адрес заблокирован")
      setIp("")
      setReason("")
      queryClient.invalidateQueries({ queryKey: ["admin-blocked-ips"] })
    },
    onError: () => toast.error("Не удалось заблокировать адрес"),
  })

  const remove = useMutation({
    mutationFn: (id: string) =>
      sdk.client.fetch(`/admin/blocked-ips/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Адрес разблокирован")
      queryClient.invalidateQueries({ queryKey: ["admin-blocked-ips"] })
    },
    onError: () => toast.error("Не удалось разблокировать"),
  })

  const rows = data?.blocked_ips || []

  return (
    <div className="flex flex-col gap-y-4">
      <Container className="flex flex-col gap-y-4 p-6">
        <Heading>Блоклист IP</Heading>
        <Text size="small" className="text-ui-fg-subtle">
          Заблокированный адрес не сможет оставлять отзывы, заявки и оформлять
          заказы.
        </Text>
        <form
          className="flex flex-col gap-y-3 max-w-md"
          onSubmit={(event) => {
            event.preventDefault()
            add.mutate()
          }}
        >
          <div className="flex flex-col gap-y-2">
            <Label>IP-адрес</Label>
            <Input
              value={ip}
              onChange={(event) => setIp(event.target.value)}
              placeholder="192.168.0.1"
            />
          </div>
          <div className="flex flex-col gap-y-2">
            <Label>Причина</Label>
            <Input
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="необязательно"
            />
          </div>
          <Button type="submit" isLoading={add.isPending}>
            Заблокировать
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
              Пока никого нет
            </Text>
          ) : (
            <div className="flex flex-col gap-y-3">
              {rows.map((row) => (
                <div
                  key={row.id}
                  className="flex items-center justify-between gap-x-4"
                >
                  <div>
                    <Text weight="plus">{row.ip}</Text>
                    {row.reason ? (
                      <Text size="small" className="text-ui-fg-subtle">
                        {row.reason}
                      </Text>
                    ) : null}
                  </div>
                  <Button
                    size="small"
                    variant="secondary"
                    onClick={() => remove.mutate(row.id)}
                    isLoading={remove.isPending}
                  >
                    Снять
                  </Button>
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
  label: "Блоклист IP",
  nested: "/shop-service",
  rank: 4,
})

export default BlockedIpsPage
