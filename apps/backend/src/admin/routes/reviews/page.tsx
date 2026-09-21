import { defineRouteConfig } from "@medusajs/admin-sdk"
import { Star } from "@medusajs/icons"
import {
  Badge,
  Button,
  Container,
  createDataTableColumnHelper,
  DataTable,
  DataTablePaginationState,
  Heading,
  toast,
  useDataTable,
} from "@medusajs/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useMemo, useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { sdk } from "../../lib/sdk"

type AdminReview = {
  id: string
  product_id: string
  author: string
  body: string
  rating: number | null
  image_urls: string[]
  status: string
  ip?: string | null
  created_at?: string
  product?: { id: string; title: string } | null
}

type ReviewsResponse = {
  reviews: AdminReview[]
  count: number
}

type OzonImportResponse = {
  imported: number
  updated: number
  skipped_rating: number
  skipped_existing: number
  skipped_product: number
  skipped_empty: number
}

const PAGE_SIZE = 20
const columnsHelper = createDataTableColumnHelper<AdminReview>()

const columns = [
  columnsHelper.accessor("author", {
    header: "Автор",
  }),
  columnsHelper.accessor((row) => row.product?.title || row.product_id, {
    id: "product",
    header: "Товар",
  }),
  columnsHelper.accessor("rating", {
    header: "Оценка",
    cell: ({ getValue }) => {
      const rating = getValue()
      if (!rating) return "—"
      return (
        <span className="inline-flex items-center gap-x-1">
          <Star />
          {rating}/5
        </span>
      )
    },
  }),
  columnsHelper.accessor("body", {
    header: "Текст",
    cell: ({ getValue }) => {
      const text = getValue()
      return text.length > 80 ? `${text.slice(0, 80)}…` : text
    },
  }),
  columnsHelper.accessor((row) => row.image_urls?.length || 0, {
    id: "photos",
    header: "Фото",
  }),
  columnsHelper.accessor("status", {
    header: "Статус",
    cell: ({ getValue }) =>
      getValue() === "published" ? (
        <Badge color="green">Опубликован</Badge>
      ) : (
        <Badge color="orange">На модерации</Badge>
      ),
  }),
  columnsHelper.accessor((row) => row.ip || "—", {
    id: "ip",
    header: "IP",
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

const ReviewsPage = () => {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [params] = useSearchParams()
  const productId = params.get("product_id") || ""
  const [search, setSearch] = useState("")
  const [pagination, setPagination] = useState<DataTablePaginationState>({
    pageSize: PAGE_SIZE,
    pageIndex: 0,
  })
  const offset = useMemo(
    () => pagination.pageIndex * PAGE_SIZE,
    [pagination.pageIndex]
  )

  const importOzon = useMutation({
    mutationFn: () =>
      sdk.client.fetch<OzonImportResponse>("/admin/reviews/ozon-import", {
        method: "POST",
      }),
    onSuccess: (result) => {
      const extra = result.skipped_product
        ? `, без товара в магазине ${result.skipped_product}`
        : ""
      toast.success(
        `С Ozon: ${result.imported} новых, обновлено ${result.updated}${extra}`
      )
      queryClient.invalidateQueries({ queryKey: ["admin-reviews"] })
    },
    onError: (error) => {
      const message =
        error instanceof Error && error.message
          ? error.message
          : "Не удалось загрузить отзывы с Ozon"
      toast.error(message)
    },
  })

  const { data, isLoading } = useQuery({
    queryFn: () =>
      sdk.client.fetch<ReviewsResponse>("/admin/reviews", {
        query: {
          limit: PAGE_SIZE,
          offset,
          q: search || undefined,
          product_id: productId || undefined,
        },
      }),
    queryKey: ["admin-reviews", PAGE_SIZE, offset, search, productId],
  })

  const table = useDataTable({
    columns,
    data: data?.reviews || [],
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
      const record = row as AdminReview & { original?: AdminReview }
      const id = record.original?.id || record.id
      if (id) navigate(`/reviews/${id}`)
    },
  })

  return (
    <Container className="divide-y p-0">
      <DataTable instance={table}>
        <DataTable.Toolbar className="flex items-center justify-between gap-x-4 px-6 py-4">
          <Heading>Отзывы</Heading>
          <div className="flex items-center gap-x-2">
            <Button
              size="small"
              variant="secondary"
              isLoading={importOzon.isPending}
              onClick={() => importOzon.mutate()}
            >
              С Ozon, 4–5 звёзд
            </Button>
            <DataTable.Search placeholder="Автор или текст" />
          </div>
        </DataTable.Toolbar>
        <DataTable.Table />
        <DataTable.Pagination />
      </DataTable>
    </Container>
  )
}

export const config = defineRouteConfig({
  label: "Отзывы",
  nested: "/products",
  rank: 4,
})

export default ReviewsPage
