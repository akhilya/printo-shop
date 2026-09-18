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

export function sortInStockFirst(products) {
  return [...(products || [])].sort((a, b) => {
    const aIn = productInStock(a) ? 1 : 0
    const bIn = productInStock(b) ? 1 : 0
    return bIn - aIn
  })
}

export function shuffleList(items) {
  const next = [...(items || [])]
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    const swap = next[i]
    next[i] = next[j]
    next[j] = swap
  }
  return next
}

export function shuffleInStockFirst(products) {
  const list = products || []
  return [
    ...shuffleList(list.filter(productInStock)),
    ...shuffleList(list.filter((item) => !productInStock(item))),
  ]
}
