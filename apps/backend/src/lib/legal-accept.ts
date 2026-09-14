export const LEGAL_ACCEPT_ERROR = "Примите условия магазина"

export function hasLegalAccepted(value: unknown) {
  return value === true || value === "true"
}
