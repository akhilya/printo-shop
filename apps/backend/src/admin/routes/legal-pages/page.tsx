import { defineRouteConfig } from "@medusajs/admin-sdk"
import { DocumentText } from "@medusajs/icons"
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

type AdminLegalPage = {
  id: string
  slug: string
  title: string
  enabled: boolean
}

const SLUG_LABELS: Record<string, string> = {
  delivery: "Доставка",
  offer: "Оферта",
  contacts: "Контакты",
  privacy: "Конфиденциальность",
}

const columnsHelper = createDataTableColumnHelper<AdminLegalPage>()
const columns = [
  columnsHelper.accessor("slug", {
    header: "Страница",
    cell: ({ getValue }) => SLUG_LABELS[getValue()] || getValue(),
  }),
  columnsHelper.accessor("title", {
    header: "Заголовок",
  }),
  columnsHelper.accessor("enabled", {
    header: "Витрина",
    cell: ({ getValue }) =>
      getValue() ? (
        <Badge color="green">Показана</Badge>
      ) : (
        <Badge color="grey">Скрыта</Badge>
      ),
  }),
]

const LegalPagesPage = () => {
  const navigate = useNavigate()
  const { data, isLoading } = useQuery({
    queryFn: () =>
      sdk.client.fetch<{ pages: AdminLegalPage[] }>("/admin/legal-pages"),
    queryKey: ["admin-legal-pages"],
  })

  const table = useDataTable({
    columns,
    data: data?.pages || [],
    getRowId: (row) => row.id,
    rowCount: data?.pages?.length || 0,
    isLoading,
    onRowClick: (_event, row) => {
      const record = row as AdminLegalPage & { original?: AdminLegalPage }
      const id = record.original?.id || record.id
      if (id) navigate(`/legal-pages/${id}`)
    },
  })

  return (
    <Container className="divide-y p-0">
      <DataTable instance={table}>
        <DataTable.Toolbar className="flex items-center justify-between px-6 py-4">
          <Heading>Документы</Heading>
        </DataTable.Toolbar>
        <DataTable.Table />
      </DataTable>
    </Container>
  )
}

export const config = defineRouteConfig({
  label: "Документы",
  icon: DocumentText,
})

export default LegalPagesPage
