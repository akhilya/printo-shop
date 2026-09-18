import { MedusaContainer } from "@medusajs/framework"
import { shopOrderUrl } from "./custom-order"
import { recordShopEvent, shopEventJsonDetail } from "./shop-event"
import { findShopOrderLookup } from "./shop-order-number"
import { loadShopOrderByNumber } from "./shop-order-lookup"
import { shopOrderCanMessage } from "./shop-order-view"
import { parseSmtpEnv, sendSmtpMail, smtpFromAddress } from "./smtp"

export const MAX_ORDER_MESSAGE = 4000

export function parseOrderMessageInput(body: unknown) {
  const rec =
    body && typeof body === "object" ? (body as Record<string, unknown>) : {}
  const email = String(rec.email || "")
    .trim()
    .toLowerCase()
  const message = String(rec.message || "").trim()
  if (!email.includes("@")) {
    return { error: "Укажите почту, с которой оформляли заказ" }
  }
  if (message.length < 10) {
    return { error: "Напишите, что случилось. Хотя бы пару предложений." }
  }
  if (message.length > MAX_ORDER_MESSAGE) {
    return { error: "Текст слишком длинный" }
  }
  return { email, message: message.slice(0, MAX_ORDER_MESSAGE) }
}

export function emailsMatch(left: unknown, right: string) {
  return String(left || "").trim().toLowerCase() === right.trim().toLowerCase()
}

export async function submitOrderMessage(
  container: MedusaContainer,
  number: string,
  input: { email: string; message: string },
  accessToken?: string | null
) {
  const presented = await loadShopOrderByNumber(container, number, accessToken)
  if (!presented) {
    return { error: "Заказ не найден", status: 404 as const }
  }
  if (!shopOrderCanMessage(presented.status?.code)) {
    const code = String(presented.status?.code || "")
    if (code === "canceled" || code === "closed") {
      return {
        error: "Заказ отменён. Письмо по нему больше не принимаем.",
        status: 400 as const,
      }
    }
    return {
      error: "Написать можно после доставки — если нужно вернуть товар.",
      status: 400 as const,
    }
  }
  if (!emailsMatch(presented.email, input.email)) {
    return {
      error: "Почта не совпадает с заказом",
      status: 400 as const,
    }
  }
  const smtp = parseSmtpEnv()
  const shop = smtp ? smtpFromAddress(smtp.from) : null
  const orderUrl = presented.url || shopOrderUrl(number)
  const lookup = await findShopOrderLookup(container, number)
  const source = lookup && String(lookup.source) === "custom" ? "custom" : "order"
  const medusaId =
    source === "order" && lookup ? String(lookup.ref_id || "") : null
  await recordShopEvent(container, {
    kind: "order_message",
    level: "warn",
    title: "Письмо по заказу",
    message: input.message.slice(0, 500),
    order_id: medusaId || number,
    shop_number: number,
    detail: shopEventJsonDetail({
      email: input.email,
      body: input.message,
      status: "open",
      medusa_order_id: medusaId,
      source,
      replies: [],
    }),
  })
  try {
    if (shop) {
      await sendSmtpMail({
        to: shop,
        replyTo: input.email,
        subject: `Письмо по заказу ${number}`,
        text: [
          `Заказ ${number}`,
          presented.url ? `Страница: ${presented.url}` : "",
          `От: ${input.email}`,
          "",
          input.message,
        ]
          .filter(Boolean)
          .join("\n"),
        html: `<p>Заказ ${number}</p><p>${input.email}</p><pre style="font-family:Arial,sans-serif;white-space:pre-wrap;">${input.message
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")}</pre>`,
      })
    }
    await sendSmtpMail({
      to: input.email,
      subject: `Заказ ${number}: письмо получили`,
      text: [
        `Получили письмо по заказу ${number}.`,
        "Ответим на эту почту. Пока не договоримся, товар обратно не отправляйте и в пункт выдачи не несите.",
        orderUrl ? `Заказ: ${orderUrl}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
      html: `<p>Получили письмо по заказу ${number}.</p><p>Ответим на эту почту. Пока не договоримся, товар обратно не отправляйте и в пункт выдачи не несите.</p>`,
    })
  } catch {
    // The log row is the fallback if SMTP fails.
  }
  return { ok: true as const }
}
