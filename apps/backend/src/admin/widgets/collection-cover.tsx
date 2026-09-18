import { defineWidgetConfig } from "@medusajs/admin-sdk"
import type { DetailWidgetProps } from "@medusajs/types"
import { Container, Heading, Text } from "@medusajs/ui"
import { CollectionCoverForm } from "../components/collection-cover-form"

type CollectionRow = {
  id: string
  metadata?: Record<string, unknown> | null
}

const CollectionCoverWidget = ({
  data,
}: DetailWidgetProps<CollectionRow>) => {
  return (
    <Container className="divide-y p-0">
      <div className="px-6 py-4">
        <Heading level="h2">Карточка коллекции</Heading>
        <Text size="small" className="text-ui-fg-subtle">
          Лицевое фото на витрине коллекций
        </Text>
      </div>
      <div className="px-6 py-4">
        <CollectionCoverForm
          collectionId={data.id}
          metadata={data.metadata}
        />
      </div>
    </Container>
  )
}

export const config = defineWidgetConfig({
  zone: "product_collection.details",
})

export default CollectionCoverWidget
