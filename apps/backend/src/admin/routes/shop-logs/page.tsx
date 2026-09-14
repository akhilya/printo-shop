import { defineRouteConfig } from "@medusajs/admin-sdk"
import { Clock } from "@medusajs/icons"
import {
  Badge,
  Container,
  createDataTableColumnHelper,
  DataTable,
  DataTablePaginationState,
  Heading,
  Text,
  useDataTable,
} from "@medusajs/ui"
import { useQuery } from "@tanstack/react-query"
import { useMemo, useState } from "react"
import { sdk } from "../../lib/sdk"

type ShopLog = {
  id: string
  kind: string
  level: string
  title: string
  message: string
  order_id: string | null
  shop_number: string | null
  posting_number: string | null
  from_status: string | null
  to_status: string | null
  created_at: string | null
}

type LogsResponse = {
  logs: ShopLog[]
  count: number
}

const PAGE_SIZE = 20
const columnsHelper = createDataTableColumnHelper<ShopLog>()

function levelBadge(level: string) {
  if (level === "error") return <Badge color="red">ошибка</Badge>
  if (level === "warn") return <Badge color="orange">внимание</Badge>
  return <Badge color="grey">событие</Badge>
}

const KIND_LABEL: Record<string, string> = {
  ozon_create: "Создание",
  ozon_pack: "Сборка",
  ozon_status: "Статус",
  ozon_unclaimed: "Невыкуп",
  ozon_refused: "Отказ на ПВЗ",
  ozon_returned: "Возврат",
  ozon_sync: "Синхронизация",
  mail: "Письмо",
  order_message: "Письмо по заказу",
}

const columns = [
  columnsHelper.accessor("created_at", {
    header: "Когда",
    cell: ({ getValue }) => {
      const value = getValue()
      if (!value) return "—"
      return new Intl.DateTimeFormat("ru-RU", {
        dateStyle: "short",
        timeStyle: "short",
      }).format(new Date(value))
    },
  }),
  columnsHelper.accessor("level", {
    header: "Тип",
    cell: ({ getValue }) => levelBadge(getValue()),
  }),
  columnsHelper.accessor("kind", {
    header: "Событие",
    cell: ({ getValue }) => KIND_LABEL[getValue()] || getValue(),
  }),
  columnsHelper.accessor(
    (row) => row.shop_number || row.order_id || "—",
    { id: "order", header: "Заказ" }
  ),
  columnsHelper.accessor("title", {
    header: "Что случилось",
  }),
  columnsHelper.accessor("message", {
    header: "Подробности",
    cell: ({ getValue }) => {
      const text = getValue()
      return text.length > 90 ? `${text.slice(0, 90)}…` : text
    },
  }),
  columnsHelper.accessor(
    (row) => {
      const from = row.from_status
      const to = row.to_status
      if (!from && !to) return "—"
      if (from && to && from !== to) return `${from} → ${to}`
      return to || from || "—"
    },
    { id: "ozon", header: "Ozon" }
  ),
]

const ShopLogsPage = () => {
  const [search, setSearch] = useState("")
  const [pagination, setPagination] = useState<DataTablePaginationState>({
    pageSize: PAGE_SIZE,
    pageIndex: 0,
  })
  const offset = useMemo(
    () => pagination.pageIndex * PAGE_SIZE,
    [pagination.pageIndex]
  )

  const { data, isLoading } = useQuery({
    queryFn: () =>
      sdk.client.fetch<LogsResponse>("/admin/shop-logs", {
        query: {
          limit: PAGE_SIZE,
          offset,
          q: search || undefined,
        },
      }),
    queryKey: ["admin-shop-logs", PAGE_SIZE, offset, search],
  })

  const table = useDataTable({
    columns,
    data: data?.logs || [],
    getRowId: (row) => row.id,
    rowCount: data?.count || 0,
    isLoading,
    pagination: {
      state: pagination,
      onPaginationChange: setPagination,
    },
    search: {
      state: search,
      onSearchChange: setSearch,
    },
  })

  return (
    <Container className="divide-y p-0">
      <DataTable instance={table}>
        <DataTable.Toolbar className="flex flex-col items-start gap-y-1 px-6 py-4">
          <Heading>Логи доставки</Heading>
          <Text size="small" className="text-ui-fg-subtle">
            Создание отправления, сборка, невыкуп, отказ на ПВЗ и ошибки
            синхронизации с Ozon.
          </Text>
          <DataTable.Search placeholder="Номер заказа или текст" />
        </DataTable.Toolbar>
        <DataTable.Table />
        <DataTable.Pagination />
      </DataTable>
    </Container>
  )
}

export const config = defineRouteConfig({
  label: "Логи",
  icon: Clock,
})

export default ShopLogsPage
