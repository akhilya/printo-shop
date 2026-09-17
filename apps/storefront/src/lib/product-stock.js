export const OUT_OF_STOCK_LABEL = "Нету в наличии"

export function variantInStock(variant) {
  if (!variant) return false
  if (variant.manage_inventory === false) return true
  const qty = Number(variant.inventory_quantity)
  return Number.isFinite(qty) && qty > 0
}

export function productInStock(product) {
  const variants = product?.variants || []
  if (!variants.length) return false
  return variants.some(variantInStock)
}
