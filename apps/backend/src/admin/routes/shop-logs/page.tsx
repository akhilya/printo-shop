import { defineRouteConfig } from "@medusajs/admin-sdk"
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
import { useNavigate } from "react-router-dom"
import { sdk } from "../../lib/sdk"

type ShopLog = {
  id: string
  kind: string
  level: string
  title: string
  message: string
  detail: string | null
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

const PAGE_SIZE = 50
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
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
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
  columnsHelper.accessor((row) => row.shop_number || row.order_id || "—", {
    id: "order",
    header: "Заказ",
  }),
  columnsHelper.accessor("title", {
    header: "Что случилось",
  }),
  columnsHelper.accessor("message", {
    header: "Кратко",
    cell: ({ getValue }) => {
      const text = getValue()
      return text.length > 80 ? `${text.slice(0, 80)}…` : text
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
  const navigate = useNavigate()
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
    onRowClick: (_event, row) => {
      const record = row as ShopLog & { original?: ShopLog }
      const id = record.original?.id || record.id
      if (id) navigate(`/shop-logs/${id}`)
    },
  })

  return (
    <Container className="divide-y p-0">
      <DataTable instance={table}>
        <DataTable.Toolbar className="flex flex-col items-start gap-y-1 px-6 py-4">
          <Heading>Журнал</Heading>
          <Text size="small" className="text-ui-fg-subtle">
            Нажмите строку, чтобы открыть полный текст ошибки, ответ Ozon и все
            идентификаторы.
          </Text>
          <DataTable.Search placeholder="Номер заказа, текст, id" />
        </DataTable.Toolbar>
        <DataTable.Table />
        <DataTable.Pagination />
      </DataTable>
    </Container>
  )
}

export const config = defineRouteConfig({
  label: "Логи",
  nested: "/inventory",
  rank: 3,
})

export default ShopLogsPage
