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
      return "canceled"
    default:
      return "pending"
  }
}

export function toKopecks(amount: unknown): number {
  const numeric =
    typeof amount === "object" && amount !== null && "numeric" in amount
      ? Number((amount as { numeric: number }).numeric)
      : Number(amount)
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
