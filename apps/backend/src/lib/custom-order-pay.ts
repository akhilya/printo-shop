import { MedusaContainer } from "@medusajs/framework"
import {
  ContainerRegistrationKeys,
  MedusaError,
  Modules,
} from "@medusajs/framework/utils"
import { tbankPublicError } from "../modules/tbank/ca"
import { TbankClient, isPublicHttpUrl } from "../modules/tbank/client"
import { customReceiptLine, orderDescription } from "../modules/tbank/receipt-lines"
import {
  promotionDiscountAmount,
  promotionIsExhausted,
  shopPromotionMaxUses,
} from "./shop-promotion"
import { loadShopPromotionUsage } from "./shop-promotion-usage"
import { toKopecks } from "../modules/tbank/status"
import { verifyTbankToken } from "../modules/tbank/token"
import {
  createOzonDeliveryOrder,
  extractOzonCreateIds,
  ozonCredsFromRow,
  ozonOfferArticle,
} from "./ozon-delivery"
import { randomBytes } from "node:crypto"
import { CUSTOM_ORDER_MODULE } from "../modules/custom-order"
import type CustomOrderModuleService from "../modules/custom-order/service"
import {
  customCheckoutCanPay,
  customOrderArrived,
  customOrderCheckoutUrl,
  customQuoteTotal,
  presentPublicCustomCheckout,
  storefrontOrigin,
} from "./custom-order"
import { getOzonPosting } from "./ozon-posting"
import { recordShopEvent, shopEventErrorDetail } from "./shop-event"
import { ensureShopAccessToken } from "./shop-order-number"
import { hasLegalAccepted, LEGAL_ACCEPT_ERROR } from "./legal-accept"
import { ensureGiftCardPromotion, newGiftCardCode } from "./gift-card"

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

export function customOrderOzonArticle(
  order: { id?: unknown },
  variants: Array<{ sku?: unknown }>,
  fallback?: unknown
) {
  const ownId = ozonOfferArticle(order.id)
  for (const variant of variants) {
    const article = ozonOfferArticle(variant.sku)
    if (article && article !== ownId) return article
  }
  const extra = ozonOfferArticle(fallback)
  if (extra && extra !== ownId) return extra
  return ""
}

async function customOrderOfferArticle(
  container: MedusaContainer,
  order: Record<string, unknown>
) {
  const settings = (await getShopSetting(container)) as unknown as Record<
    string,
    unknown
  >
  const fallback = settings.ozon_custom_article
  const productId = text(order.product_id)
  if (!productId) return customOrderOzonArticle(order, [], fallback)
  try {
    const productModule = container.resolve(Modules.PRODUCT) as {
      listProductVariants: (
        filters: { product_id: string },
        config?: { select?: string[]; take?: number }
      ) => Promise<Array<{ sku?: string | null }>>
    }
    const variants = await productModule.listProductVariants(
      { product_id: productId },
      { select: ["sku"], take: 20 }
    )
    return customOrderOzonArticle(order, variants, fallback)
  } catch {
    return customOrderOzonArticle(order, [], fallback)
  }
}

async function noteCustomOzonFailure(
  container: MedusaContainer,
  order: Record<string, unknown>,
  message: string,
  error?: unknown
) {
  await recordShopEvent(container, {
    kind: "ozon_custom",
    level: "error",
    title: "Не удалось оформить доставку",
    message,
    detail: error ? shopEventErrorDetail(error) : null,
    order_id: text(order.id) || null,
    shop_number: text(order.shop_number) || null,
  }).catch(() => undefined)
}

export async function ensureCustomOrderOzon(
  container: MedusaContainer,
  order: Record<string, unknown>
) {
  if (!order.paid_at) return order
  return createOzonForCustomOrder(container, order)
}

async function createOzonForCustomOrder(
  container: MedusaContainer,
  order: Record<string, unknown>,
  options?: { required?: boolean }
) {
  const pointId = text(order.ozon_point_id)
  if (text(order.ozon_order_number) || text(order.ozon_posting_number)) {
    return order
  }
  if (!pointId) {
    if (options?.required) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Выберите пункт выдачи"
      )
    }
    return order
  }
  const row = (await getShopSetting(container)) as unknown as Record<
    string,
    unknown
  >
  const creds = ozonCredsFromRow(row)
  if (!creds) {
    if (options?.required) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        "Не удалось оформить доставку."
      )
    }
    return order
  }
  const amount = Number(order.quote_amount) || 0
  const title =
    text(order.quote_note) ||
    text(order.product_title) ||
    "Индивидуальный заказ"
  const article = await customOrderOfferArticle(container, order)
  if (!article) {
    await noteCustomOzonFailure(
      container,
      order,
      "У индивидуального заказа нет артикула Ozon"
    )
    if (options?.required) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Не удалось оформить доставку."
      )
    }
    return order
  }
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
      shippingTotal: Number(order.quote_shipping_amount) || 0,
      items: [
        {
          article,
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
  } catch (error) {
    await noteCustomOzonFailure(
      container,
      order,
      "Индивидуальный заказ не ушёл в доставку",
      error
    )
    if (options?.required) {
      throw new MedusaError(
        MedusaError.Types.UNEXPECTED_STATE,
        "Не удалось оформить доставку."
      )
    }
    return order
  }
}

export async function refreshCustomOrderArrival(
  container: MedusaContainer,
  order: Record<string, unknown>
) {
  if (order.pay_on_arrival !== true || order.paid_at || !order.buyer_ready_at) {
    return order
  }
  if (customOrderArrived(order.ozon_posting_status)) return order
  const postingNumber = text(order.ozon_posting_number)
  const orderNumber = text(order.ozon_order_number)
  if (!postingNumber && !orderNumber) return order
  const row = (await getShopSetting(container)) as unknown as Record<
    string,
    unknown
  >
  const creds = ozonCredsFromRow(row)
  if (!creds) return order
  try {
    const info = await getOzonPosting(creds, postingNumber, orderNumber)
    const patch: Record<string, unknown> = {}
    if (info.status && info.status !== text(order.ozon_posting_status)) {
      patch.ozon_posting_status = info.status
    }
    if (
      info.postingNumber &&
      info.postingNumber !== postingNumber
    ) {
      patch.ozon_posting_number = info.postingNumber
    }
    if (!Object.keys(patch).length) return order
    return saveCustomOrder(container, String(order.id), patch)
  } catch {
    return order
  }
}

export async function refreshPostpayArrivals(container: MedusaContainer) {
  const service: CustomOrderModuleService = container.resolve(CUSTOM_ORDER_MODULE)
  const rows = await service.listCustomOrders(
    { pay_on_arrival: true },
    { take: 100, order: { updated_at: "DESC" } }
  )
  for (const row of rows) {
    const order = row as Record<string, unknown>
    if (order.paid_at || !order.buyer_ready_at) continue
    if (customOrderArrived(order.ozon_posting_status)) continue
    await refreshCustomOrderArrival(container, order)
  }
}

export async function placeCustomOrder(
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
  if (order.pay_on_arrival !== true || order.delivery_method !== "ozon") {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "Этот заказ оплачивается сразу"
    )
  }
  if (order.buyer_ready_at && text(order.ozon_order_number)) {
    return presentPublicCustomCheckout(order)
  }
  const parsed = parseCustomCheckoutPay(body)
  if ("error" in parsed) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, parsed.error)
  }
  if (!parsed.ozon_point_id) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Выберите пункт выдачи"
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
  if (!phone) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "Укажите телефон")
  }
  const saved = await saveCustomOrder(container, String(order.id), {
    email,
    phone,
    name: parsed.name || order.name,
    ozon_point_id: parsed.ozon_point_id,
    ozon_point_name: parsed.ozon_point_name,
    ozon_point_address: parsed.ozon_point_address,
  })
  const shipped = await createOzonForCustomOrder(
    container,
    { ...order, ...saved },
    { required: true }
  )
  const ready = await saveCustomOrder(container, String(order.id), {
    buyer_ready_at: order.buyer_ready_at || new Date(),
  })
  return presentPublicCustomCheckout({ ...shipped, ...ready })
}

export async function markCustomOrderPaid(
  container: MedusaContainer,
  order: Record<string, unknown>
) {
  const justPaid = !order.paid_at
  let paid = order
  if (justPaid) {
    const next = await saveCustomOrder(container, String(order.id), {
      paid_at: new Date(),
      status: "paid",
    })
    paid = { ...order, ...next }
  }
  const giftAmount = Number(paid.gift_card_amount)
  let giftCardMailSent = false
  if (giftAmount > 0) {
    let giftCode = text(paid.gift_card_code)
    if (!giftCode) {
      const secret = text(process.env.JWT_SECRET || process.env.COOKIE_SECRET)
      if (!secret) {
        throw new MedusaError(
          MedusaError.Types.INVALID_DATA,
          "Не удалось безопасно создать сертификат"
        )
      }
      giftCode = newGiftCardCode(String(paid.id), secret)
      paid = await saveCustomOrder(container, String(paid.id), {
        gift_card_code: giftCode,
      })
      paid = { ...order, ...paid, paid_at: paid.paid_at || order.paid_at || new Date() }
    }
    await ensureGiftCardPromotion(container, giftCode, giftAmount)
    if (!paid.gift_card_email_sent_at) {
      const { sendCustomOrderMail } = await import("./order-mail.js")
      const result = await sendCustomOrderMail(container, paid, "placed")
      if (!result.skipped) {
        const saved = await saveCustomOrder(container, String(paid.id), {
          gift_card_email_sent_at: new Date(),
        })
        paid = { ...paid, ...saved }
        giftCardMailSent = true
      }
    }
  }
  paid = await createOzonForCustomOrder(container, paid)
  if (justPaid && giftAmount <= 0 && !giftCardMailSent) {
    const { sendCustomOrderMail } = await import("./order-mail.js")
    await sendCustomOrderMail(container, paid, "placed")
  }
  return paid
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
      legal_accepted: boolean
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
  if (!hasLegalAccepted(rec.legal_accepted)) {
    return { error: LEGAL_ACCEPT_ERROR }
  }
  return {
    email: email || null,
    phone: phone || null,
    name: name || null,
    ozon_point_id: ozonPointId || null,
    ozon_point_name: ozonPointName || null,
    ozon_point_address: ozonPointAddress || null,
    legal_accepted: true,
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
  if (Number(order.gift_card_amount) > 0) {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "На подарочный сертификат нельзя применить промокод"
    )
  }
  if (order.paid_at) {
    throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Заказ уже оплачен")
  }
  if (order.buyer_ready_at) {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "Заказ уже оформлен"
    )
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
      "limit",
      "is_automatic",
      "status",
      "application_method.type",
      "application_method.value",
      "application_method.target_type",
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
  const usage = await loadShopPromotionUsage(container)
  const used = usage[promoCode] || 0
  if (promotionIsExhausted(used, shopPromotionMaxUses(promo))) {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "Этот промокод уже нельзя применить"
    )
  }
  const method = (promo.application_method || {}) as Record<string, unknown>
  const base = customBaseAmounts(order)
  const promoDiscount = promotionDiscountAmount(method, base)
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
  if (Number(order.gift_card_amount) > 0) {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "Для сертификата промокод не применялся"
    )
  }
  if (order.paid_at) {
    throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Заказ уже оплачен")
  }
  if (order.buyer_ready_at) {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "Заказ уже оформлен"
    )
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
  if (
    Number(order.gift_card_amount) > 0 &&
    (Number(order.quote_amount) !== Number(order.gift_card_amount) ||
      Number(order.promo_discount) > 0 ||
      text(order.promo_code))
  ) {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "Не удалось проверить сумму сертификата"
    )
  }
  const postpay =
    order.delivery_method === "ozon" && order.pay_on_arrival === true
  const current = postpay
    ? await refreshCustomOrderArrival(container, order)
    : order
  if (postpay && !customCheckoutCanPay(current)) {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      current.buyer_ready_at
        ? "Оплатить можно, когда заказ приедет в пункт выдачи."
        : "Сначала выберите пункт выдачи"
    )
  }
  const parsed = parseCustomCheckoutPay(body)
  if ("error" in parsed) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, parsed.error)
  }
  const picksPvz =
    current.delivery_method === "ozon" && current.client_picks_pvz === true
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

async function presentCustomCheckoutWithAccess(
  container: MedusaContainer,
  order: Record<string, unknown>
) {
  const number = String(order.shop_number || "").trim()
  const token = number ? await ensureShopAccessToken(container, number) : null
  return presentPublicCustomCheckout(order, null, token)
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
    const paid = await markCustomOrderPaid(container, order)
    return presentCustomCheckoutWithAccess(container, paid)
  }
  const paymentId = text(order.tbank_payment_id)
  if (!paymentId) {
    return presentCustomCheckoutWithAccess(container, order)
  }
  const settings = (await getShopSetting(container)) as unknown as Record<
    string,
    unknown
  >
  const options = tbankOptionsFromRow(settings)
  if (!options) {
    return presentCustomCheckoutWithAccess(container, order)
  }
  const client = new TbankClient({
    terminalKey: options.terminalKey,
    password: options.password,
    apiUrl: options.apiUrl,
  })
  const state = await client.getState(paymentId)
  if (
    String(state.OrderId || "") !== text(order.tbank_order_id) ||
    Number(state.Amount) !== toKopecks(order.quote_amount)
  ) {
    return presentCustomCheckoutWithAccess(container, order)
  }
  if (!isTbankPaidStatus(state.Status)) {
    return presentCustomCheckoutWithAccess(container, order)
  }
  const paid = await markCustomOrderPaid(container, order)
  return presentCustomCheckoutWithAccess(container, paid)
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
  if (!order) return
  if (
    String(payload.OrderId || "") !== text(order.tbank_order_id) ||
    Number(payload.Amount) !== toKopecks(order.quote_amount)
  ) return
  if (
    order.paid_at &&
    (!order.gift_card_amount ||
      (order.gift_card_code && order.gift_card_email_sent_at))
  ) return
  await markCustomOrderPaid(container, order)
}
