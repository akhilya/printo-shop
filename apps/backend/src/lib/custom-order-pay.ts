import { MedusaContainer } from "@medusajs/framework"
import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils"
import { tbankPublicError } from "../modules/tbank/ca"
import { TbankClient, isPublicHttpUrl } from "../modules/tbank/client"
import { customReceiptLine, orderDescription } from "../modules/tbank/receipt-lines"
import { toKopecks } from "../modules/tbank/status"
import { verifyTbankToken } from "../modules/tbank/token"
import {
  createOzonDeliveryOrder,
  extractOzonCreateIds,
  ozonCredsFromRow,
} from "./ozon-delivery"
import { randomBytes } from "node:crypto"
import { CUSTOM_ORDER_MODULE } from "../modules/custom-order"
import type CustomOrderModuleService from "../modules/custom-order/service"
import {
  customOrderCheckoutUrl,
  customQuoteTotal,
  presentPublicCustomCheckout,
  storefrontOrigin,
} from "./custom-order"

import {
  getShopSetting,
  tbankOptionsFromRow,
} from "./shop-setting"
import { isTbankPaidStatus } from "./tbank-paid"

export function newCheckoutToken() {
  return randomBytes(24).toString("base64url")
}

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function text(value: unknown) {
  return String(value || "").trim()
}

export async function findCustomOrderByToken(
  container: MedusaContainer,
  token: string
) {
  const value = text(token)
  if (!value) return null
  const service: CustomOrderModuleService = container.resolve(CUSTOM_ORDER_MODULE)
  const [row] = await service.listCustomOrders(
    { checkout_token: value },
    { take: 1 }
  )
  return (row || null) as Record<string, unknown> | null
}

export async function findCustomOrderByPaymentId(
  container: MedusaContainer,
  paymentId: string
) {
  const value = text(paymentId)
  if (!value) return null
  const service: CustomOrderModuleService = container.resolve(CUSTOM_ORDER_MODULE)
  const [row] = await service.listCustomOrders(
    { tbank_payment_id: value },
    { take: 1 }
  )
  return (row || null) as Record<string, unknown> | null
}

async function saveCustomOrder(
  container: MedusaContainer,
  id: string,
  patch: Record<string, unknown>
) {
  const service: CustomOrderModuleService = container.resolve(CUSTOM_ORDER_MODULE)
  const updated = await service.updateCustomOrders({ id, ...patch })
  const row = Array.isArray(updated) ? updated[0] : updated
  return (row || { id, ...patch }) as Record<string, unknown>
}

async function createOzonForCustomOrder(
  container: MedusaContainer,
  order: Record<string, unknown>
) {
  const pointId = text(order.ozon_point_id)
  if (!pointId) return order
  const row = (await getShopSetting(container)) as unknown as Record<
    string,
    unknown
  >
  const creds = ozonCredsFromRow(row)
  if (!creds) return order
  const amount = Number(order.quote_amount) || 0
  const title =
    text(order.quote_note) ||
    text(order.product_title) ||
    "Индивидуальный заказ"
  try {
    const created = await createOzonDeliveryOrder({
      creds,
      orderNumber: text(order.shop_number) || text(order.id),
      buyer: {
        name: text(order.name) || "Покупатель",
        phone: text(order.phone),
        email: text(order.email) || undefined,
      },
      point: {
        id: pointId,
        address: text(order.ozon_point_address),
      },
      amount,
      items: [
        {
          article: text(order.id) || "custom",
          name: title.slice(0, 128),
          quantity: 1,
          price: amount,
        },
      ],
    })
    const ids = extractOzonCreateIds(created)
    return saveCustomOrder(container, String(order.id), {
      ozon_order_number: ids.orderNumber,
      ozon_posting_number: ids.postingNumber,
      ozon_tracking: ids.trackingUrl,
    })
  } catch {
    return order
  }
}

export async function markCustomOrderPaid(
  container: MedusaContainer,
  order: Record<string, unknown>
) {
  if (order.paid_at) return order
  const next = await saveCustomOrder(container, String(order.id), {
    paid_at: new Date(),
    status: "paid",
  })
  return createOzonForCustomOrder(container, { ...order, ...next })
}

export function parseCustomCheckoutPay(body: unknown):
  | { error: string }
  | {
      email: string | null
      phone: string | null
      name: string | null
      ozon_point_id: string | null
      ozon_point_name: string | null
      ozon_point_address: string | null
    } {
  const rec = asRecord(body)
  const email = text(rec.email)
  const phone = text(rec.phone)
  const name = text(rec.name) || text(rec.first_name)
  const ozonPointId = text(rec.ozon_point_id)
  const ozonPointName = text(rec.ozon_point_name)
  const ozonPointAddress = text(rec.ozon_point_address)
  if (email && !email.includes("@")) {
    return { error: "Проверьте адрес почты" }
  }
  return {
    email: email || null,
    phone: phone || null,
    name: name || null,
    ozon_point_id: ozonPointId || null,
    ozon_point_name: ozonPointName || null,
    ozon_point_address: ozonPointAddress || null,
  }
}

function customBaseAmounts(order: Record<string, unknown>) {
  const items = Number(order.quote_items_amount ?? order.quote_amount) || 0
  const discount = Number(order.quote_discount_amount) || 0
  const shipping = Number(order.quote_shipping_amount) || 0
  const other = Number(order.quote_other_amount) || 0
  return { items, discount, shipping, other }
}

export async function applyCustomOrderPromo(
  container: MedusaContainer,
  token: string,
  code: string
) {
  const order = await findCustomOrderByToken(container, token)
  if (!order || order.quote_amount == null) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, "Страница не найдена")
  }
  if (order.paid_at) {
    throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Заказ уже оплачен")
  }
  const promoCode = text(code).toUpperCase()
  if (!promoCode) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "Введите промокод")
  }
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "promotion",
    fields: [
      "id",
      "code",
      "is_automatic",
      "status",
      "application_method.type",
      "application_method.value",
    ],
    filters: { code: promoCode },
  })
  const promo = ((data ?? [])[0] || null) as Record<string, unknown> | null
  if (!promo) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, "Такого промокода нет")
  }
  if (promo.is_automatic === true) {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "Этот промокод применяется сам и на индивидуальный заказ не действует"
    )
  }
  const method = (promo.application_method || {}) as Record<string, unknown>
  const value = Number(method.value)
  const base = customBaseAmounts(order)
  let promoDiscount = 0
  if (String(method.type || "").toLowerCase().includes("percent")) {
    promoDiscount = Math.round((base.items * value) / 100)
  } else if (Number.isFinite(value) && value > 0) {
    promoDiscount = Math.round(value)
  }
  promoDiscount = Math.min(Math.max(promoDiscount, 0), base.items)
  const total = customQuoteTotal({ ...base, promo: promoDiscount })
  if (total < 1) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "После промокода сумма слишком мала"
    )
  }
  const service: CustomOrderModuleService = container.resolve(CUSTOM_ORDER_MODULE)
  const updated = await service.updateCustomOrders({
    id: String(order.id),
    promo_code: promoCode,
    promo_discount: promoDiscount,
    quote_amount: total,
  })
  const row = Array.isArray(updated) ? updated[0] : updated
  return presentPublicCustomCheckout((row || order) as Record<string, unknown>)
}

export async function removeCustomOrderPromo(
  container: MedusaContainer,
  token: string
) {
  const order = await findCustomOrderByToken(container, token)
  if (!order || order.quote_amount == null) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, "Страница не найдена")
  }
  if (order.paid_at) {
    throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Заказ уже оплачен")
  }
  const base = customBaseAmounts(order)
  const total = customQuoteTotal(base)
  const service: CustomOrderModuleService = container.resolve(CUSTOM_ORDER_MODULE)
  const updated = await service.updateCustomOrders({
    id: String(order.id),
    promo_code: null,
    promo_discount: 0,
    quote_amount: total,
  })
  const row = Array.isArray(updated) ? updated[0] : updated
  return presentPublicCustomCheckout((row || order) as Record<string, unknown>)
}

export async function startCustomOrderPayment(
  container: MedusaContainer,
  token: string,
  body: unknown
) {
  const order = await findCustomOrderByToken(container, token)
  if (!order || order.quote_amount == null) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, "Страница не найдена")
  }
  if (order.paid_at) {
    throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Заказ уже оплачен")
  }
  const parsed = parseCustomCheckoutPay(body)
  if ("error" in parsed) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, parsed.error)
  }
  const picksPvz =
    order.delivery_method === "ozon" && order.client_picks_pvz === true
  if (picksPvz && !parsed.ozon_point_id) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Выберите пункт выдачи Ozon"
    )
  }
  const email = parsed.email || text(order.email)
  const phone = parsed.phone || text(order.phone)
  if (!email) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Укажите почту для чека"
    )
  }
  const settings = (await getShopSetting(container)) as unknown as Record<
    string,
    unknown
  >
  const options = tbankOptionsFromRow(settings)
  if (!options) {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "Оплата не настроена"
    )
  }
  const amountKopecks = toKopecks(order.quote_amount)
  if (amountKopecks < 100) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Сумма заказа слишком мала для оплаты."
    )
  }
  const checkoutUrl = customOrderCheckoutUrl(String(order.checkout_token))
  const successUrl = checkoutUrl ? `${checkoutUrl}/success` : options.successUrl
  const failUrl = `${storefrontOrigin()}/checkout/fail`
  const title =
    text(order.quote_note) ||
    text(order.product_title) ||
    "Индивидуальный заказ"
  const tbankOrderId =
    `c${String(order.checkout_token || "").replace(/[^a-zA-Z0-9]/g, "").slice(0, 8)}${Date.now().toString(36)}`.slice(
      0,
      50
    )
  const client = new TbankClient({
    terminalKey: options.terminalKey,
    password: options.password,
    apiUrl: options.apiUrl,
  })
  const shopNumber = text(order.shop_number) || null
  const items = [customReceiptLine(title, amountKopecks, shopNumber)]
  let result
  try {
    result = await client.init({
      orderId: tbankOrderId,
      amountKopecks,
      description: orderDescription(items, {
        number: shopNumber,
        custom: true,
      }),
      items,
      notificationUrl: options.notificationUrl,
      successUrl: isPublicHttpUrl(successUrl) ? successUrl : undefined,
      failUrl: isPublicHttpUrl(failUrl) ? failUrl : undefined,
      customerEmail: email,
      customerPhone: phone || undefined,
      payType: options.payType,
      receipt: true,
      taxation: options.taxation,
      vat: options.vat,
    })
  } catch (error) {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      tbankPublicError(error)
    )
  }
  const paymentId = String(result.PaymentId || "")
  if (!paymentId || !result.PaymentURL) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Не удалось создать платёж"
    )
  }
  await saveCustomOrder(container, String(order.id), {
    email,
    phone: phone || order.phone,
    name: parsed.name || order.name,
    tbank_payment_id: paymentId,
    tbank_order_id: result.OrderId || tbankOrderId,
    ozon_point_id: parsed.ozon_point_id,
    ozon_point_name: parsed.ozon_point_name,
    ozon_point_address: parsed.ozon_point_address,
    status: "quoted",
  })
  return { payment_url: String(result.PaymentURL) }
}

export async function confirmCustomOrderPayment(
  container: MedusaContainer,
  token: string
) {
  const order = await findCustomOrderByToken(container, token)
  if (!order || order.quote_amount == null) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, "Страница не найдена")
  }
  if (order.paid_at) {
    return presentPublicCustomCheckout(order)
  }
  const paymentId = text(order.tbank_payment_id)
  if (!paymentId) {
    return presentPublicCustomCheckout(order)
  }
  const settings = (await getShopSetting(container)) as unknown as Record<
    string,
    unknown
  >
  const options = tbankOptionsFromRow(settings)
  if (!options) {
    return presentPublicCustomCheckout(order)
  }
  const client = new TbankClient({
    terminalKey: options.terminalKey,
    password: options.password,
    apiUrl: options.apiUrl,
  })
  const state = await client.getState(paymentId)
  if (!isTbankPaidStatus(state.Status)) {
    return presentPublicCustomCheckout(order)
  }
  const paid = await markCustomOrderPaid(container, order)
  return presentPublicCustomCheckout(paid)
}

export async function applyTbankNotificationToCustomOrder(
  container: MedusaContainer,
  payload: Record<string, unknown>
) {
  const settings = (await getShopSetting(container)) as unknown as Record<
    string,
    unknown
  >
  const options = tbankOptionsFromRow(settings)
  if (!options) return
  if (!verifyTbankToken(payload, options.password)) return
  if (!isTbankPaidStatus(String(payload.Status || ""))) return
  const paymentId = text(payload.PaymentId)
  if (!paymentId) return
  const order = await findCustomOrderByPaymentId(container, paymentId)
  if (!order || order.paid_at) return
  await markCustomOrderPaid(container, order)
}
