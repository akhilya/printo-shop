import { defineRouteConfig } from "@medusajs/admin-sdk"
import { PencilSquare } from "@medusajs/icons"
import {
  Badge,
  Container,
  createDataTableColumnHelper,
  DataTable,
  DataTablePaginationState,
  Heading,
  useDataTable,
} from "@medusajs/ui"
import { useQuery } from "@tanstack/react-query"
import { useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { primaryContact } from "../../../lib/custom-order"
import { sdk } from "../../lib/sdk"

type AdminCustomOrder = {
  id: string
  name: string
  email: string | null
  phone: string | null
  telegram: string | null
  max_account: string | null
  vk: string | null
  message: string
  product_title: string | null
  status: string
  created_at?: string
}

type OrdersResponse = {
  orders: AdminCustomOrder[]
  count: number
}

const PAGE_SIZE = 20

const STATUS_LABEL: Record<string, string> = {
  new: "Новая",
  in_progress: "В работе",
  closed: "Закрыта",
}

const columnsHelper = createDataTableColumnHelper<AdminCustomOrder>()
const columns = [
  columnsHelper.accessor("name", { header: "Имя" }),
  columnsHelper.accessor((row) => primaryContact(row), {
    id: "contact",
    header: "Контакт",
  }),
  columnsHelper.accessor((row) => row.product_title || "Своя модель", {
    id: "product",
    header: "Товар",
  }),
  columnsHelper.accessor("status", {
    header: "Статус",
    cell: ({ getValue }) => {
      const status = getValue()
      const color =
        status === "closed" ? "grey" : status === "in_progress" ? "blue" : "green"
      return <Badge color={color}>{STATUS_LABEL[status] || status}</Badge>
    },
  }),
  columnsHelper.accessor("created_at", {
    header: "Дата",
    cell: ({ getValue }) => {
      const value = getValue()
      if (!value) return "—"
      return new Intl.DateTimeFormat("ru-RU", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(value))
    },
  }),
]

const CustomOrdersPage = () => {
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
      sdk.client.fetch<OrdersResponse>("/admin/custom-orders", {
        query: {
          limit: PAGE_SIZE,
          offset,
          q: search || undefined,
        },
      }),
    queryKey: ["admin-custom-orders", PAGE_SIZE, offset, search],
  })

  const table = useDataTable({
    columns,
    data: data?.orders || [],
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
      const record = row as AdminCustomOrder & { original?: AdminCustomOrder }
      const id = record.original?.id || record.id
      if (id) navigate(`/custom-orders/${id}`)
    },
  })

  return (
    <Container className="divide-y p-0">
      <DataTable instance={table}>
        <DataTable.Toolbar className="flex items-center justify-between px-6 py-4">
          <Heading>Индивидуальные заказы</Heading>
          <DataTable.Search placeholder="Имя, почта, текст" />
        </DataTable.Toolbar>
        <DataTable.Table />
        <DataTable.Pagination />
      </DataTable>
    </Container>
  )
}

export const config = defineRouteConfig({
  label: "Индивидуальные заказы",
  icon: PencilSquare,
})

export default CustomOrdersPage
