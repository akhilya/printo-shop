const RETRY_DELAYS_MS = [
  5 * 60 * 1000,
  15 * 60 * 1000,
  60 * 60 * 1000,
  6 * 60 * 60 * 1000,
  24 * 60 * 60 * 1000,
]

export function ozonCreateRetryMetadata(
  metadata: Record<string, unknown>,
  now = Date.now()
) {
  const storedAttempts = Number(metadata.ozon_create_attempts)
  const attempts =
    Number.isSafeInteger(storedAttempts) && storedAttempts > 0
      ? storedAttempts
      : 0
  const nextAttempt = attempts + 1
  const delay = RETRY_DELAYS_MS[
    Math.min(nextAttempt - 1, RETRY_DELAYS_MS.length - 1)
  ]

  return {
    ozon_create_attempts: nextAttempt,
    ozon_create_retry_after: new Date(now + delay).toISOString(),
  }
}

export function isOzonCreateRetryDue(
  metadata: Record<string, unknown>,
  now = Date.now()
) {
  if (!metadata.ozon_create_error) return false
  if (metadata.ozon_order_number || metadata.ozon_posting_number) return false

  const retryAfter = Date.parse(String(metadata.ozon_create_retry_after || ""))
  return !Number.isFinite(retryAfter) || retryAfter <= now
}
