export function visibleCheckoutShipping({
  quoteMode,
  quoted,
  cartShipping,
}) {
  const live = Number(quoted)
  if (Number.isFinite(live) && live > 0) return live
  if (quoteMode === "fixed") {
    const fixed = Number(cartShipping)
    return Number.isFinite(fixed) && fixed > 0 ? fixed : 0
  }
  return 0
}
