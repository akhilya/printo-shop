import { orderMailCopy, type OrderMailEvent } from "./order-mail-copy"

export type OrderMailItem = {
  title: string
  quantity: number
  sku?: string | null
  unit_price?: number | null
  total?: number | null
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
  logo_url?: string | null
}

function moneyAmount(value: unknown): number | null {
  if (value == null || value === "") return null
  if (typeof value === "number") return Number.isFinite(value) ? value : null
  if (typeof value === "object") {
    const rec = value as { numeric?: unknown; value?: unknown; amount?: unknown }
    return moneyAmount(rec.numeric ?? rec.value ?? rec.amount)
  }
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

export function formatShopMoney(value: unknown, currency = "rub") {
  const parsed = moneyAmount(value)
  if (parsed == null) return null
  const amount = Math.round(parsed)
  const code = String(currency || "RUB").toUpperCase()
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: /^[A-Z]{3}$/.test(code) ? code : "RUB",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

function lineMoney(item: OrderMailItem, currency: string) {
  const quantity = Math.max(1, Number(item.quantity) || 1)
  const total = moneyAmount(item.total)
  if (total != null) return formatShopMoney(total, currency)
  const unit = moneyAmount(item.unit_price)
  if (unit == null) return null
  return formatShopMoney(unit * quantity, currency)
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
      const sum = lineMoney(item, currency)
      return `• ${lineTitle(item)} — ${item.quantity} шт.${sum ? `, ${sum}` : ""}`
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
    copy.footer ? `\n${copy.footer}` : "",
    payload.returns_url ? `Правила возврата: ${payload.returns_url}` : "",
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
      const price = lineMoney(item, currency) || "—"
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
    ? `<p style="margin:32px 0 0;text-align:right;"><a href="${escapeHtml(payload.url)}" style="display:inline-block;background:#000;color:#fff;text-decoration:none;padding:12px 20px;font-size:14px;font-weight:500;">Открыть заказ</a></p>`
    : ""
  const track = payload.ozon_tracking
    ? `<p style="margin:8px 0 0;font-size:14px;"><a href="${escapeHtml(payload.ozon_tracking)}" style="color:#000;">Отследить на Ozon</a></p>`
    : ""
  const logo = payload.logo_url
    ? `<p style="margin:0 0 24px;text-align:center;"><img src="${escapeHtml(payload.logo_url)}" alt="PrintO.studio" width="180" style="display:block;margin:0 auto;border:0;height:auto;max-width:180px;" /></p>`
    : `<p style="margin:0 0 24px;text-align:center;font-size:12px;letter-spacing:0.08em;">PrintO.studio</p>`
  const details = payload.details
    ? `<div style="margin:16px 0 0;padding:16px;border:1px solid #000;"><p style="margin:0;font-size:14px;line-height:1.5;white-space:pre-wrap;">${escapeHtml(payload.details)}</p></div>`
    : ""
  return `<!doctype html>
<html lang="ru">
<body style="margin:0;padding:0;background:#fff;color:#000;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:32px 24px;">
    ${logo}
    <h1 style="margin:0 0 12px;font-size:28px;font-weight:600;letter-spacing:-0.03em;">${escapeHtml(copy.subject)}</h1>
    <p style="margin:0 0 24px;font-size:16px;line-height:1.5;">${escapeHtml(copy.intro)}</p>
    <p style="margin:0 0 4px;font-size:14px;">Статус: ${escapeHtml(payload.status_label)}</p>
    ${payload.name ? `<p style="margin:0 0 4px;font-size:14px;">Получатель: ${escapeHtml(payload.name)}</p>` : ""}
    ${payload.phone ? `<p style="margin:0 0 16px;font-size:14px;">Телефон: ${escapeHtml(payload.phone)}</p>` : "<p style=\"margin:0 0 16px;\"></p>"}
    <table style="width:100%;border-collapse:collapse;">${rows}</table>
    ${details}
    ${pvz ? `<p style="margin:24px 0 0;font-size:14px;"><strong>Пункт выдачи Ozon</strong><br />${escapeHtml(pvz)}</p>` : ""}
    ${payload.ozon_posting_number ? `<p style="margin:8px 0 0;font-size:14px;">Отправление: ${escapeHtml(payload.ozon_posting_number)}</p>` : ""}
    ${track}
    ${payload.shipping != null ? `<p style="margin:16px 0 0;font-size:14px;">Доставка: ${escapeHtml(formatShopMoney(payload.shipping, currency) || "")}</p>` : ""}
    ${payload.total != null ? `<p style="margin:4px 0 0;font-size:16px;font-weight:500;">Итого: ${escapeHtml(formatShopMoney(payload.total, currency) || "")}</p>` : ""}
    ${button}
    ${copy.footer ? `<p style="margin:24px 0 0;font-size:12px;line-height:1.4;color:#737373;">${escapeHtml(copy.footer)}${payload.returns_url ? ` <a href="${escapeHtml(payload.returns_url)}" style="color:#000;">Правила возврата</a>` : ""}</p>` : payload.returns_url ? `<p style="margin:24px 0 0;font-size:12px;line-height:1.4;color:#737373;"><a href="${escapeHtml(payload.returns_url)}" style="color:#000;">Правила возврата</a></p>` : ""}
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
