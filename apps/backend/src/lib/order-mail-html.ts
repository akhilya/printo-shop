import { orderMailCopy, type OrderMailEvent } from "./order-mail-copy"

export type OrderMailItem = {
  title: string
  quantity: number
  sku?: string | null
  unit_price?: number | null
}

export type OrderMailPayload = {
  event: OrderMailEvent
  number: string
  url: string | null
  email: string
  name?: string | null
  phone?: string | null
  status_label: string
  items: OrderMailItem[]
  shipping?: number | null
  total?: number | null
  currency_code?: string
  ozon_point_name?: string | null
  ozon_point_address?: string | null
  ozon_tracking?: string | null
  ozon_posting_number?: string | null
  return_kind?: string | null
  details?: string | null
  returns_url?: string | null
}

export function formatShopMoney(
  value: number | null | undefined,
  currency = "rub"
) {
  if (value == null || !Number.isFinite(value)) return null
  const code = currency.toUpperCase() === "RUB" ? "RUB" : currency.toUpperCase()
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: code,
    maximumFractionDigits: 0,
  }).format(value)
}

export function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

function lineTitle(item: OrderMailItem) {
  const sku = item.sku ? ` · ${item.sku}` : ""
  return `${item.title}${sku}`
}

export function orderMailText(payload: OrderMailPayload) {
  const copy = orderMailCopy(payload.event, payload.number, payload.return_kind)
  const currency = payload.currency_code || "rub"
  const lines = [
    copy.subject,
    "",
    copy.intro,
    "",
    `Статус: ${payload.status_label}`,
    payload.name ? `Получатель: ${payload.name}` : "",
    payload.phone ? `Телефон: ${payload.phone}` : "",
    "",
    "Состав",
    ...payload.items.map((item) => {
      const price = formatShopMoney(item.unit_price, currency)
      const sum =
        item.unit_price != null
          ? formatShopMoney(item.unit_price * item.quantity, currency)
          : null
      return `• ${lineTitle(item)} — ${item.quantity} шт.${price ? `, ${price}` : ""}${sum && item.quantity > 1 ? ` (${sum})` : ""}`
    }),
    payload.details ? `\n${payload.details}` : "",
    payload.ozon_point_name || payload.ozon_point_address
      ? `\nДоставка Ozon\nПВЗ: ${[payload.ozon_point_name, payload.ozon_point_address].filter(Boolean).join(". ")}`
      : "",
    payload.ozon_posting_number
      ? `Отправление: ${payload.ozon_posting_number}`
      : "",
    payload.ozon_tracking ? `Отследить: ${payload.ozon_tracking}` : "",
    payload.shipping != null
      ? `Доставка: ${formatShopMoney(payload.shipping, currency)}`
      : "",
    payload.total != null
      ? `Итого: ${formatShopMoney(payload.total, currency)}`
      : "",
    payload.url ? `\nОткрыть заказ: ${payload.url}` : "",
    payload.returns_url
      ? `Возврат только по письму: ${payload.returns_url}`
      : "",
    "",
    "PrintO.studio",
  ]
  return lines.filter((line) => line !== "").join("\n")
}

export function orderMailHtml(payload: OrderMailPayload) {
  const copy = orderMailCopy(payload.event, payload.number, payload.return_kind)
  const currency = payload.currency_code || "rub"
  const rows = payload.items
    .map((item) => {
      const price = formatShopMoney(item.unit_price, currency) || "—"
      return `<tr>
        <td style="padding:8px 0;border-bottom:1px solid #000;font-size:14px;">${escapeHtml(lineTitle(item))}<br /><span style="color:#737373;">${item.quantity} шт.</span></td>
        <td style="padding:8px 0;border-bottom:1px solid #000;font-size:14px;text-align:right;white-space:nowrap;">${escapeHtml(price)}</td>
      </tr>`
    })
    .join("")
  const pvz = [payload.ozon_point_name, payload.ozon_point_address]
    .filter(Boolean)
    .join(". ")
  const button = payload.url
    ? `<p style="margin:32px 0 0;"><a href="${escapeHtml(payload.url)}" style="display:inline-block;background:#000;color:#fff;text-decoration:none;padding:12px 20px;font-size:14px;font-weight:500;">Открыть заказ</a></p>`
    : ""
  const track = payload.ozon_tracking
    ? `<p style="margin:8px 0 0;font-size:14px;"><a href="${escapeHtml(payload.ozon_tracking)}" style="color:#000;">Отследить на Ozon</a></p>`
    : ""
  return `<!doctype html>
<html lang="ru">
<body style="margin:0;padding:0;background:#fff;color:#000;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:32px 24px;">
    <p style="margin:0 0 24px;font-size:12px;letter-spacing:0.08em;">PRINTO.STUDIO</p>
    <h1 style="margin:0 0 12px;font-size:28px;font-weight:600;letter-spacing:-0.03em;">${escapeHtml(copy.subject)}</h1>
    <p style="margin:0 0 24px;font-size:16px;line-height:1.5;">${escapeHtml(copy.intro)}</p>
    <p style="margin:0 0 4px;font-size:14px;">Статус: ${escapeHtml(payload.status_label)}</p>
    ${payload.name ? `<p style="margin:0 0 4px;font-size:14px;">Получатель: ${escapeHtml(payload.name)}</p>` : ""}
    ${payload.phone ? `<p style="margin:0 0 16px;font-size:14px;">Телефон: ${escapeHtml(payload.phone)}</p>` : "<p style=\"margin:0 0 16px;\"></p>"}
    <table style="width:100%;border-collapse:collapse;">${rows}</table>
    ${payload.details ? `<p style="margin:16px 0 0;font-size:14px;line-height:1.5;white-space:pre-wrap;">${escapeHtml(payload.details)}</p>` : ""}
    ${pvz ? `<p style="margin:24px 0 0;font-size:14px;"><strong>Пункт выдачи Ozon</strong><br />${escapeHtml(pvz)}</p>` : ""}
    ${payload.ozon_posting_number ? `<p style="margin:8px 0 0;font-size:14px;">Отправление: ${escapeHtml(payload.ozon_posting_number)}</p>` : ""}
    ${track}
    ${payload.shipping != null ? `<p style="margin:16px 0 0;font-size:14px;">Доставка: ${escapeHtml(formatShopMoney(payload.shipping, currency) || "")}</p>` : ""}
    ${payload.total != null ? `<p style="margin:4px 0 0;font-size:16px;font-weight:500;">Итого: ${escapeHtml(formatShopMoney(payload.total, currency) || "")}</p>` : ""}
    ${button}
    ${payload.returns_url ? `<p style="margin:24px 0 0;font-size:12px;line-height:1.4;color:#737373;">Вернуть товар одной кнопкой нельзя. <a href="${escapeHtml(payload.returns_url)}" style="color:#000;">Как написать о заказе</a></p>` : ""}
  </div>
</body>
</html>`
}

export function buildOrderMail(payload: OrderMailPayload) {
  const copy = orderMailCopy(payload.event, payload.number, payload.return_kind)
  return {
    to: payload.email,
    subject: copy.subject,
    text: orderMailText(payload),
    html: orderMailHtml(payload),
  }
}
