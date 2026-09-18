import { Button, Label, Select, toast } from "@medusajs/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useState } from "react"
import { sdk } from "../lib/sdk"

type CoverProduct = {
  id: string
  title?: string | null
  thumbnail?: string | null
}

export type CollectionCoverFormProps = {
  collectionId: string
  metadata?: Record<string, unknown> | null
}

export const CollectionCoverForm = ({
  collectionId,
  metadata,
}: CollectionCoverFormProps) => {
  const queryClient = useQueryClient()
  const [productId, setProductId] = useState(
    String(metadata?.shop_cover_product_id || "")
  )
  const [imageUrl, setImageUrl] = useState(
    String(metadata?.shop_cover_image_url || "")
  )

  useEffect(() => {
    setProductId(String(metadata?.shop_cover_product_id || ""))
    setImageUrl(String(metadata?.shop_cover_image_url || ""))
  }, [metadata?.shop_cover_product_id, metadata?.shop_cover_image_url])

  const { data: products } = useQuery({
    queryFn: () =>
      sdk.client.fetch<{ products: CoverProduct[] }>("/admin/products", {
        query: {
          collection_id: collectionId,
          limit: 100,
          fields: "id,title,thumbnail",
        },
      }),
    queryKey: ["admin-collection-products", collectionId],
  })

  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      sdk.client.fetch<{ cover?: { product_id: string | null; image_url: string | null } }>(
        `/admin/shop-collections/${collectionId}/cover`,
        {
          method: "POST",
          body,
        }
      ),
    onSuccess: (result) => {
      toast.success("Обложка коллекции сохранена")
      setProductId(String(result.cover?.product_id || ""))
      setImageUrl(String(result.cover?.image_url || ""))
      queryClient.invalidateQueries({
        queryKey: ["admin-collection-products", collectionId],
      })
      queryClient.invalidateQueries({ queryKey: ["admin-shop-collections"] })
    },
    onError: () => toast.error("Не удалось сохранить обложку"),
  })

  async function onUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (!file) return
    try {
      const uploaded = await sdk.admin.upload.create({ files: [file] })
      const url = uploaded.files?.[0]?.url
      if (!url) {
        toast.error("Не удалось загрузить фото")
        return
      }
      setImageUrl(url)
      setProductId("")
      save.mutate({ image_url: url })
    } catch {
      toast.error("Не удалось загрузить фото")
    }
  }

  const items = products?.products || []
  const preview =
    imageUrl ||
    items.find((item) => item.id === productId)?.thumbnail ||
    ""

  return (
    <div className="flex flex-col gap-y-4">
      {preview ? (
        <img
          src={preview}
          alt=""
          className="h-28 w-28 rounded-md object-cover"
        />
      ) : null}
      <div className="flex flex-col gap-y-2">
        <Label>Товар на обложке</Label>
        <Select
          value={imageUrl ? "photo" : productId || "auto"}
          onValueChange={(value) => {
            if (value === "photo") return
            const next = value === "auto" ? "" : value
            setProductId(next)
            setImageUrl("")
            if (next) save.mutate({ product_id: next })
            else save.mutate({ clear: true })
          }}
        >
          <Select.Trigger>
            <Select.Value placeholder="Как есть" />
          </Select.Trigger>
          <Select.Content>
            <Select.Item value="auto">Как есть</Select.Item>
            {imageUrl ? (
              <Select.Item value="photo">Своё фото</Select.Item>
            ) : null}
            {items.map((item) => (
              <Select.Item key={item.id} value={item.id}>
                {item.title || item.id}
              </Select.Item>
            ))}
          </Select.Content>
        </Select>
      </div>
      <div className="flex flex-col gap-y-2">
        <Label>Своё фото</Label>
        <input type="file" accept="image/*" onChange={onUpload} />
      </div>
      {imageUrl || productId ? (
        <Button
          size="small"
          variant="secondary"
          onClick={() => {
            setProductId("")
            setImageUrl("")
            save.mutate({ clear: true })
          }}
        >
          Сбросить
        </Button>
      ) : null}
    </div>
  )
}
