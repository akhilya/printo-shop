export function shopError(error, fallback) {
  const raw = String(
    error?.message || (typeof error === "string" ? error : "")
  ).trim()
  if (!raw) return fallback
  if (
    /medusa|localhost|publishable|stack|t-?bank|ключ|HTTP\s*\d+|unknown_error|invalid_|oauth|token|[{}"]/i.test(
      raw
    )
  ) {
    return fallback
  }
  if (/[A-Za-z]{3,}/.test(raw) && !/[А-Яа-яЁё]/.test(raw)) {
    return fallback
  }
  return raw
}
