export type DelegatField = {
  key: string
  name: string
  type?: string
  is_required?: boolean
  description?: string
  group?: string
  sort_order?: number
  options?: { value: string; label: string }[]
}

export type DelegatVariantPayload = {
  variant_id: string
  sku?: string | null
  tech_size?: string | null
  marketplace_size?: string | null
  barcode?: string | null
  price?: number | null
  sale_price?: number | null
  old_price?: number | null
  quantity?: number | null
  attributes?: Record<string, string> | null
}

export type DelegatProductPayload = {
  delegat_product_id?: string | null
  product_id?: string | null
  sku?: string | null
  name: string
  description?: string | null
  short_description?: string | null
  price?: number | null
  sale_price?: number | null
  old_price?: number | null
  quantity?: number | null
  barcode?: string | null
  brand?: string | null
  status?: string | null
  category_ids?: string[] | null
  group_id?: string | number | null
  groupId?: string | number | null
  group_name?: string | null
  groupName?: string | null
  image_urls?: string[] | null
  image_keys?: string[] | null
  attributes?: Record<string, string> | null
  specs?: DelegatShopSpec[] | null
  variants?: DelegatVariantPayload[] | null
  raw_fields?: Record<string, unknown> | null
}

export type DelegatShopSpec = {
  key?: string | null
  label: string
  value: string
}

export type DelegatMappedVariant = {
  delegatVariantId: string
  title: string
  sku?: string
  barcode?: string
  options: Record<string, string>
  amount: number
  old_price?: number | null
  quantity: number
}

export type DelegatMappedProduct = {
  title: string
  handle: string
  description?: string
  status: "draft" | "proposed" | "published" | "rejected"
  sku?: string
  categoryIds: string[]
  imageUrls: string[]
  metadata: Record<string, string>
  optionValues: Record<string, string[]>
  variants: DelegatMappedVariant[]
}
