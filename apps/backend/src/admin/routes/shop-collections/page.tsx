import { defineRouteConfig } from "@medusajs/admin-sdk"
import { Container, Heading, Text } from "@medusajs/ui"
import { useQuery } from "@tanstack/react-query"
import { CollectionCoverForm } from "../../components/collection-cover-form"
import { sdk } from "../../lib/sdk"

type AdminCollection = {
  id: string
  title?: string | null
  metadata?: Record<string, unknown> | null
}

const ShopCollectionsPage = () => {
  const { data, isLoading, isError } = useQuery({
    queryFn: () =>
      sdk.client.fetch<{ collections: AdminCollection[] }>(
        "/admin/shop-collections"
      ),
    queryKey: ["admin-shop-collections"],
  })

  const collections = data?.collections || []

  return (
    <div className="flex flex-col gap-y-4">
      <Container className="p-6">
        <Heading>Карточки коллекций</Heading>
        <Text size="small" className="text-ui-fg-subtle">
          Лицевой товар или своё фото на карточке коллекции в магазине.
        </Text>
      </Container>
      {isLoading ? (
        <Container className="p-6">
          <Text>Загрузка</Text>
        </Container>
      ) : null}
      {isError ? (
        <Container className="p-6">
          <Text>Не удалось загрузить коллекции</Text>
        </Container>
      ) : null}
      {!isLoading && !isError && !collections.length ? (
        <Container className="p-6">
          <Text>Коллекций пока нет</Text>
        </Container>
      ) : null}
      {collections.map((collection) => (
        <Container key={collection.id} className="divide-y p-0">
          <div className="px-6 py-4">
            <Heading level="h2">{collection.title || collection.id}</Heading>
          </div>
          <div className="px-6 py-4">
            <CollectionCoverForm
              collectionId={collection.id}
              metadata={collection.metadata}
            />
          </div>
        </Container>
      ))}
    </div>
  )
}

export const config = defineRouteConfig({
  label: "Обложки",
  nested: "/products",
  rank: 5,
})

export default ShopCollectionsPage
