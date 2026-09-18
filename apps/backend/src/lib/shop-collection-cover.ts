export const SHOP_COVER_PRODUCT_KEY = "shop_cover_product_id"
export const SHOP_COVER_IMAGE_KEY = "shop_cover_image_url"

export type ShopCollectionCover = {
  product_id: string | null
  image_url: string | null
}

export type ShopGroupProductImage = {
  product_id: string
  src: string
}

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

export function readShopCollectionCover(metadata: unknown): ShopCollectionCover {
  const meta = asRecord(metadata)
  const image_url = String(meta[SHOP_COVER_IMAGE_KEY] || "").trim() || null
  const product_id = String(meta[SHOP_COVER_PRODUCT_KEY] || "").trim() || null
  if (image_url) return { image_url, product_id: null }
  return { image_url: null, product_id }
}

export function parseShopCollectionCover(body: unknown) {
  const input = asRecord(body)
  if (input.clear === true) {
    return { product_id: null, image_url: null }
  }
  const imageRaw = input.image_url
  const productRaw = input.product_id
  const image_url =
    imageRaw == null ? undefined : String(imageRaw).trim() || null
  const product_id =
    productRaw == null ? undefined : String(productRaw).trim() || null
  if (image_url) {
    return { product_id: null, image_url }
  }
  if (product_id !== undefined) {
    return { product_id, image_url: null }
  }
  if (image_url === null) {
    return { product_id: null, image_url: null }
  }
  return { error: "Укажите товар или фото" }
}

export function mergeShopCollectionCoverMetadata(
  metadata: unknown,
  cover: ShopCollectionCover
) {
  const next = { ...asRecord(metadata) }
  if (cover.image_url) {
    next[SHOP_COVER_IMAGE_KEY] = cover.image_url
    delete next[SHOP_COVER_PRODUCT_KEY]
  } else if (cover.product_id) {
    next[SHOP_COVER_PRODUCT_KEY] = cover.product_id
    delete next[SHOP_COVER_IMAGE_KEY]
  } else {
    delete next[SHOP_COVER_IMAGE_KEY]
    delete next[SHOP_COVER_PRODUCT_KEY]
  }
  return next
}

export function applyShopGroupCoverImages(
  productImages: ShopGroupProductImage[],
  cover: ShopCollectionCover,
  limit = 4
) {
  const rest: string[] = []
  const seen = new Set<string>()
  let face = cover.image_url
  if (face) seen.add(face)

  for (const row of productImages) {
    const src = String(row.src || "").trim()
    if (!src) continue
    if (!face && cover.product_id && row.product_id === cover.product_id) {
      face = src
      seen.add(src)
      continue
    }
    if (seen.has(src)) continue
    rest.push(src)
    seen.add(src)
  }

  const images = face ? [face, ...rest] : rest
  return images.slice(0, Math.max(1, limit))
}
