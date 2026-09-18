import { defineRouteConfig } from "@medusajs/admin-sdk"
import {
  Badge,
  Button,
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

type ShopIssue = {
  id: string
  created_at: string | null
  shop_number: string | null
  email: string | null
  message: string
  status: string
  refunded: boolean
  order_status: { code: string; label: string } | null
}

type IssuesResponse = {
  issues: ShopIssue[]
  count: number
}

const PAGE_SIZE = 30
const columnsHelper = createDataTableColumnHelper<ShopIssue>()

function statusBadge(status: string) {
  if (status === "open") return <Badge color="orange">открыто</Badge>
  if (status === "refunded") return <Badge color="blue">возврат</Badge>
  if (status === "canceled") return <Badge color="red">отмена</Badge>
  return <Badge color="grey">закрыто</Badge>
}

const columns = [
  columnsHelper.accessor("shop_number", {
    header: "Заказ",
    cell: ({ getValue }) => getValue() || "—",
  }),
  columnsHelper.accessor("status", {
    header: "Обращение",
    cell: ({ getValue }) => statusBadge(getValue()),
  }),
  columnsHelper.accessor((row) => row.order_status?.label || "—", {
    id: "order_status",
    header: "Статус заказа",
  }),
  columnsHelper.accessor("email", {
    header: "Почта",
    cell: ({ getValue }) => getValue() || "—",
  }),
  columnsHelper.accessor("message", {
    header: "Текст",
    cell: ({ getValue }) => {
      const text = getValue()
      return text.length > 80 ? `${text.slice(0, 80)}…` : text
    },
  }),
  columnsHelper.accessor("created_at", {
    header: "Когда",
    cell: ({ getValue }) => {
      const value = getValue()
      if (!value) return "—"
      return new Intl.DateTimeFormat("ru-RU", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(value))
    },
  }),
]

const ShopIssuesPage = () => {
  const navigate = useNavigate()
  const [search, setSearch] = useState("")
  const [status, setStatus] = useState("open")
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
      sdk.client.fetch<IssuesResponse>("/admin/shop-issues", {
        query: {
          limit: PAGE_SIZE,
          offset,
          q: search || undefined,
          status,
        },
      }),
    queryKey: ["admin-shop-issues", PAGE_SIZE, offset, search, status],
  })

  const table = useDataTable({
    columns,
    data: data?.issues || [],
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
      const record = row as ShopIssue & { original?: ShopIssue }
      const id = record.original?.id || record.id
      if (id) navigate(`/shop-issues/${id}`)
    },
  })

  return (
    <Container className="divide-y p-0">
      <DataTable instance={table}>
        <DataTable.Toolbar className="flex flex-col items-start gap-y-3 px-6 py-4">
          <div>
            <Heading>Обращения</Heading>
            <Text size="small" className="text-ui-fg-subtle">
              Письма покупателей после доставки. Можно вернуть оплату без отмены
              заказа, отменить с возвратом или ответить.
            </Text>
          </div>
          <div className="flex flex-wrap gap-2">
            {[
              { id: "open", label: "Открытые" },
              { id: "closed", label: "Закрытые" },
              { id: "all", label: "Все" },
            ].map((item) => (
              <Button
                key={item.id}
                size="small"
                variant={status === item.id ? "primary" : "secondary"}
                onClick={() => {
                  setStatus(item.id)
                  setPagination({ pageSize: PAGE_SIZE, pageIndex: 0 })
                }}
              >
                {item.label}
              </Button>
            ))}
          </div>
          <DataTable.Search placeholder="Номер заказа, почта, текст" />
        </DataTable.Toolbar>
        <DataTable.Table />
        <DataTable.Pagination />
      </DataTable>
    </Container>
  )
}

export const config = defineRouteConfig({
  label: "Обращения",
  nested: "/orders",
  rank: 1,
})

export default ShopIssuesPage
