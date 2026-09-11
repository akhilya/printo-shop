import { toKopecks } from "./status"

export type TbankReceiptLine = {
  name: string
  quantity: number
  priceKopecks: number
  amountKopecks: number
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function lineName(item: Record<string, unknown>) {
  const variant = asRecord(item.variant)
  const product = asRecord(variant.product)
  const title = String(product.title || item.title || item.product_title || "Товар").trim()
  const variantTitle = String(variant.title || "").trim()
  const sku = String(variant.sku || item.sku || "").trim()
  const bits = [title]
  if (variantTitle && variantTitle.toLowerCase() !== "default") {
    bits.push(variantTitle)
  }
  if (sku) bits.push(sku)
  return bits.join(" · ").slice(0, 128)
}

export function orderDescription(
  lines: TbankReceiptLine[],
  options?: { number?: string | null; custom?: boolean }
) {
  const items = lines
    .map((line) =>
      line.quantity > 1 ? `${line.name} ×${line.quantity}` : line.name
    )
    .join(", ")
  const number = options?.number ? ` ${options.number}` : ""
  const head = options?.custom
    ? `Индивидуальный заказ${number}`
    : `Заказ${number}`
  const text = items ? `${head}. ${items}` : head
  return text.replace(/\s+/g, " ").trim().slice(0, 140)
}

export function customReceiptLine(
  title: string,
  amountKopecks: number,
  number?: string | null
): TbankReceiptLine {
  const detail = String(title || "").trim() || "Фигурка"
  const name = `Индивидуальный заказ${number ? ` ${number}` : ""} · ${detail}`
  return {
    name: name.slice(0, 128),
    quantity: 1,
    priceKopecks: amountKopecks,
    amountKopecks,
  }
}

export function receiptLinesFromCart(
  cart: Record<string, unknown> | null | undefined,
  totalKopecks: number
): TbankReceiptLine[] {
  const lines: TbankReceiptLine[] = []
  const items = (cart?.items as Array<Record<string, unknown>>) || []
  for (const item of items) {
    const quantity = Math.max(1, Number(item.quantity) || 1)
    const lineTotal = item.total ?? item.subtotal ?? item.unit_price
    let amountKopecks = toKopecks(lineTotal)
    if (item.total == null && item.subtotal == null) {
      amountKopecks = toKopecks(item.unit_price) * quantity
    }
    if (amountKopecks <= 0) continue
    lines.push({
      name: lineName(item),
      quantity,
      priceKopecks: Math.round(amountKopecks / quantity),
      amountKopecks,
    })
  }
  const shipping = (cart?.shipping_methods as Array<Record<string, unknown>>) || []
  for (const method of shipping) {
    const amountKopecks = toKopecks(method.amount)
    if (amountKopecks <= 0) continue
    lines.push({
      name: String(method.name || "Доставка").slice(0, 128),
      quantity: 1,
      priceKopecks: amountKopecks,
      amountKopecks,
    })
  }
  if (!lines.length && totalKopecks > 0) {
    lines.push({
      name: "Заказ",
      quantity: 1,
      priceKopecks: totalKopecks,
      amountKopecks: totalKopecks,
    })
  }
  const sum = lines.reduce((acc, line) => acc + line.amountKopecks, 0)
  const diff = totalKopecks - sum
  if (diff && lines.length) {
    const last = lines[lines.length - 1]
    last.amountKopecks += diff
    last.priceKopecks = Math.round(last.amountKopecks / last.quantity)
  }
  return lines
}
