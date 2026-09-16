export function cartLineForVariant(cart, variantId) {
  const id = String(variantId || "")
  if (!id) return null
  const items = Array.isArray(cart?.items) ? cart.items : []
  return (
    items.find(
      (item) =>
        String(item.variant_id || "") === id ||
        String(item.variant?.id || "") === id
    ) || null
  )
}
