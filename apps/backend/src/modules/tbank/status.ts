export type MedusaPaymentStatus =
  | "authorized"
  | "captured"
  | "canceled"
  | "failed"
  | "pending"

export function mapTbankStatus(status?: string | null): MedusaPaymentStatus {
  switch ((status ?? "").toUpperCase()) {
    case "CONFIRMED":
      return "captured"
    case "AUTHORIZED":
      return "authorized"
    case "REJECTED":
    case "DEADLINE_EXPIRED":
      return "failed"
    case "CANCELED":
    case "REVERSED":
    case "PARTIAL_REVERSED":
    case "REFUNDED":
    case "PARTIAL_REFUNDED":
      return "canceled"
    default:
      return "pending"
  }
}

export function toKopecks(amount: unknown): number {
  if (amount && typeof amount === "object") {
    const rec = amount as { numeric?: unknown; value?: unknown }
    if (typeof rec.numeric === "number" && Number.isFinite(rec.numeric)) {
      return Math.round(rec.numeric * 100)
    }
    if (rec.value != null && rec.value !== "") {
      const fromValue = Number(rec.value)
      if (Number.isFinite(fromValue)) {
        return Math.round(fromValue * 100)
      }
    }
  }
  const numeric = Number(amount)
  if (!Number.isFinite(numeric)) {
    return 0
  }
  return Math.round(numeric * 100)
}

export function fromKopecks(amount: unknown): number {
  const numeric = Number(amount)
  if (!Number.isFinite(numeric)) {
    return 0
  }
  return numeric / 100
}
