export function isCartAlreadyCompletedError(error) {
  const parts = [
    error?.message,
    error?.error?.message,
    error?.cause?.message,
    typeof error === "string" ? error : "",
  ]
  return /already completed/i.test(parts.filter(Boolean).join(" "))
}

export function isCompletedCart(cart) {
  return Boolean(cart?.completed_at)
}
