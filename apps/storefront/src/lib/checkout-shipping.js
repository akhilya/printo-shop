export function visibleCheckoutShipping({
  quoteMode,
  quoted,
  cartShipping,
  shopFixedAmount,
}) {
  const live = Number(quoted)
  if (Number.isFinite(live) && live > 0) return live
  if (quoteMode === "fixed") {
    const shop = Number(shopFixedAmount)
    if (Number.isFinite(shop) && shop > 0) return shop
    const fixed = Number(cartShipping)
    return Number.isFinite(fixed) && fixed > 0 ? fixed : 0
  }
  return 0
}
