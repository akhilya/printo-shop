import { defineRouteConfig } from "@medusajs/admin-sdk"
import {
  Badge,
  Container,
  createDataTableColumnHelper,
  DataTable,
  Heading,
  useDataTable,
} from "@medusajs/ui"
import { useQuery } from "@tanstack/react-query"
import { useNavigate } from "react-router-dom"
import { sdk } from "../../lib/sdk"

type AdminBanner = {
  id: string
  slot: string
  title: string
  enabled: boolean
}

const SLOT_LABELS: Record<string, string> = {
  home_hero: "Главная — сверху",
  home_catalog: "Главная — каталог",
  home_custom: "Главная — индивидуальный заказ",
  home_order: "Главная — заказ",
  home_lucky: "Главная — мне повезёт",
  product_lucky: "Товар — мне повезёт",
}

const columnsHelper = createDataTableColumnHelper<AdminBanner>()
const columns = [
  columnsHelper.accessor("slot", {
    header: "Место",
    cell: ({ getValue }) => SLOT_LABELS[getValue()] || getValue(),
  }),
  columnsHelper.accessor("title", {
    header: "Заголовок",
  }),
  columnsHelper.accessor("enabled", {
    header: "Статус",
    cell: ({ getValue }) =>
      getValue() ? (
        <Badge color="green">Включён</Badge>
      ) : (
        <Badge color="grey">Выключен</Badge>
      ),
  }),
]

const BannersPage = () => {
  const navigate = useNavigate()
  const { data, isLoading } = useQuery({
    queryFn: () =>
      sdk.client.fetch<{ banners: AdminBanner[] }>("/admin/banners"),
    queryKey: ["admin-banners"],
  })

  const table = useDataTable({
    columns,
    data: data?.banners || [],
    getRowId: (row) => row.id,
    rowCount: data?.banners?.length || 0,
    isLoading,
    onRowClick: (_event, row) => {
      const record = row as AdminBanner & { original?: AdminBanner }
      const id = record.original?.id || record.id
      if (id) navigate(`/banners/${id}`)
    },
  })

  return (
    <Container className="divide-y p-0">
      <DataTable instance={table}>
        <DataTable.Toolbar className="flex items-center justify-between px-6 py-4">
          <Heading>Баннеры</Heading>
        </DataTable.Toolbar>
        <DataTable.Table />
      </DataTable>
    </Container>
  )
}

export const config = defineRouteConfig({
  label: "Баннеры",
  nested: "/products",
  rank: 1,
})

export default BannersPage
