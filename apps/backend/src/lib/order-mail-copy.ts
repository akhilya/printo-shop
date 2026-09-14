export const ORDER_MAIL_EVENTS = [
  "placed",
  "packed",
  "delivering",
  "delivered",
  "returned",
] as const

export type OrderMailEvent = (typeof ORDER_MAIL_EVENTS)[number]

export function isOrderMailEvent(value: string): value is OrderMailEvent {
  return (ORDER_MAIL_EVENTS as readonly string[]).includes(value)
}

export function mailEventFromShopStatus(status: string | null | undefined) {
  switch (status) {
    case "awaiting_deliver":
      return "packed"
    case "delivering":
      return "delivering"
    case "delivered":
      return "delivered"
    case "returned":
      return "returned"
    default:
      return null
  }
}

export function orderMailCopy(
  event: OrderMailEvent,
  number: string,
  returnKind?: string | null
) {
  const order = `Заказ ${number}`
  if (event === "placed") {
    return {
      subject: `${order} принят`,
      intro:
        "Оплата прошла. Собираем заказ и передадим его в доставку Ozon.",
    }
  }
  if (event === "packed") {
    return {
      subject: `${order} собран`,
      intro:
        "Заказ собран. Скоро сдадим его в пункт приёма Ozon. Ниже пункт выдачи и ссылка, чтобы открыть заказ.",
    }
  }
  if (event === "delivering") {
    return {
      subject: `${order} в доставке`,
      intro:
        "Заказ едет в выбранный пункт выдачи Ozon. Там он хранится 14 дней. Продлить хранение нельзя.",
    }
  }
  if (event === "delivered") {
    return {
      subject: `${order} получен`,
      intro:
        "Заказ забрали в пункте выдачи. Спасибо. Если брак или ошибка — напишите нам с страницы заказа. Вернуть товар одной кнопкой нельзя.",
    }
  }
  if (returnKind === "refused") {
    return {
      subject: `${order}: отказ на пункте выдачи`,
      intro:
        "В пункте выдачи от заказа отказались. Посылка возвращается нам. Невыкуп сам по себе оплату не возвращает. Если забрать заказ было физически нельзя — напишите с страницы заказа, разберём.",
    }
  }
  if (returnKind === "unclaimed") {
    return {
      subject: `${order}: не забрали на ПВЗ`,
      intro:
        "Заказ не забрали за 14 дней. Посылка возвращается нам. Невыкуп оплату не возвращает. Если забрать заказ было физически нельзя — напишите с страницы заказа, разберём.",
    }
  }
  return {
    subject: `${order} возвращается`,
    intro:
      "Отправление возвращается нам. Это ещё не возврат оплаты. Если забрать заказ было физически нельзя — напишите с страницы заказа.",
  }
}

export function mailSentMap(metadata: Record<string, unknown>) {
  const raw = metadata.mail_sent
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {}
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === "string" && value) out[key] = value
  }
  return out
}

export function mailAlreadySent(
  metadata: Record<string, unknown>,
  event: OrderMailEvent
) {
  return Boolean(mailSentMap(metadata)[event])
}

export function withMailSent(
  metadata: Record<string, unknown>,
  event: OrderMailEvent
) {
  return {
    ...metadata,
    mail_sent: {
      ...mailSentMap(metadata),
      [event]: new Date().toISOString(),
    },
  }
}
