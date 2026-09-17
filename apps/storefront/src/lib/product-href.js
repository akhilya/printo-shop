export function productHref(item) {
  const handle = String(
    item?.product_handle ||
      item?.handle ||
      item?.product?.handle ||
      item?.variant?.product?.handle ||
      ""
  ).trim()
  return handle ? `/p/${handle}` : ""
}
