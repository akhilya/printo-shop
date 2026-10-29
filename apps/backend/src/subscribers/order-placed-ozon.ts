import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import type { MedusaContainer } from "@medusajs/framework/types"
import {
  ContainerRegistrationKeys,
  MedusaError,
  Modules,
} from "@medusajs/framework/utils"
import {
  createOzonDeliveryOrder,
  extractOzonCreateIds,
  normalizeOzonPhone,
  ozonAdminErrorMessage,
  ozonCredsFromRow,
  ozonOrderItemsForCreate,
  ozonSellerCreateRequestStarted,
  ozonSellerReady,
} from "../lib/ozon-delivery"
import {
  createOzonDeliveryApiOrder,
  matchOzonDeliveryApiPoint,
  newOzonDeliveryIdempotencyKey,
  ozonDeliveryApiConfigFromRow,
} from "../lib/ozon-delivery-api"
import { ensureMedusaShopNumber } from "../lib/shop-order-number"
import {
  recordShopEvent,
  shopEventErrorDetail,
  shopEventJsonDetail,
} from "../lib/shop-event"
import { getShopSetting } from "../lib/shop-setting"
import { shopOrderShipping } from "../lib/shop-order-view"
import {
  canManuallyRetryOzonOrderCreation,
  isOzonCreateRetryDue,
  ozonCreateRetryMetadata,
} from "../lib/ozon-create-retry"

function money(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (value && typeof value === "object") {
    const rec = value as { numeric?: unknown }
    if (typeof rec.numeric === "number") return rec.numeric
  }
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : 0
}

export type OzonOrderCreateResult = {
  status: "created" | "failed" | "skipped"
  message: string
}

const activeOrderCreates = new Map<string, Promise<OzonOrderCreateResult>>()

type OzonOrderCreateOptions = {
  force?: boolean
}

export async function createOzonOrderForMedusaOrder(
  container: MedusaContainer,
  orderId: string,
  options: OzonOrderCreateOptions = {}
) {
  const running = activeOrderCreates.get(orderId)
  if (running) return running

  const task = createOzonOrderForMedusaOrderInner(
    container,
    orderId,
    options
  ).finally(() => activeOrderCreates.delete(orderId))
  activeOrderCreates.set(orderId, task)
  return task
}

async function createOzonOrderForMedusaOrderInner(
  container: MedusaContainer,
  orderId: string,
  options: OzonOrderCreateOptions
): Promise<OzonOrderCreateResult> {
  const row = (await getShopSetting(container)) as unknown as Record<string, unknown>
  const creds = ozonCredsFromRow(row)
  const deliveryConfig = ozonDeliveryApiConfigFromRow(row)
  const sellerReady = ozonSellerReady(creds)
  if (!sellerReady && !deliveryConfig) {
    return { status: "skipped", message: "Не настроено подключение к Ozon" }
  }

  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "order",
    fields: [
      "id",
      "display_id",
      "status",
      "email",
      "total",
      "shipping_total",
      "metadata",
      "items.title",
      "items.quantity",
      "items.unit_price",
      "items.total",
      "items.subtotal",
      "items.variant_sku",
      "items.sku",
      "items.variant_id",
      "items.variant.sku",
      "items.variant.barcode",
      "items.variant.metadata",
      "items.variant.product.title",
      "items.metadata",
      "shipping_address.first_name",
      "shipping_address.last_name",
      "shipping_address.phone",
      "shipping_address.address_1",
      "shipping_address.address_2",
      "shipping_address.company",
    ],
    filters: { id: orderId },
  })
  const loadedOrder = ((data ?? [])[0] || null) as Record<string, unknown> | null
  if (!loadedOrder) return { status: "skipped", message: "Заказ не найден" }
  const order = loadedOrder
  let metadata = (order.metadata || {}) as Record<string, unknown>
  if (order.status === "canceled") {
    return { status: "skipped", message: "Заказ отменён" }
  }
  if (metadata.ozon_order_number || metadata.ozon_posting_number) {
    return { status: "skipped", message: "Отправление Ozon уже создано" }
  }
  if (options.force) {
    if (!canManuallyRetryOzonOrderCreation(metadata)) {
      return { status: "skipped", message: "У заказа уже нет ошибки создания Ozon" }
    }
  } else if (metadata.ozon_create_error && !isOzonCreateRetryDue(metadata)) {
    return { status: "skipped", message: "Повторная попытка пока не наступила" }
  }
  const address = (order.shipping_address || {}) as Record<string, unknown>
  const pointId = String(metadata.ozon_point_id || address.company || "")
  if (!pointId) {
    return { status: "skipped", message: "У заказа не найден пункт выдачи Ozon" }
  }

  const name =
    [address.first_name, address.last_name].filter(Boolean).join(" ").trim() ||
    "Покупатель"
  const phone = String(address.phone || "")
  const shopNumber =
    (await ensureMedusaShopNumber(container, orderId)) ||
    (metadata.shop_number ? String(metadata.shop_number) : null) ||
    (order.display_id ? String(order.display_id) : null)
  if (shopNumber) metadata.shop_number = shopNumber
  const orderModule = container.resolve(Modules.ORDER) as {
    updateOrders: (
      id: string,
      data: { metadata: Record<string, unknown> }
    ) => Promise<unknown>
  }

  async function saveMeta(next: Record<string, unknown>) {
    await orderModule.updateOrders(orderId, { metadata: next })
  }

  async function recordCreateFailure(error: unknown, previousError?: unknown) {
    const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
    const raw = error instanceof Error ? error.message : String(error)
    const message = ozonAdminErrorMessage(error)
    logger.warn(`Ozon order create failed for ${orderId}: ${raw}`)
    await recordShopEvent(container, {
      kind: "ozon_create",
      level: "error",
      title: "Не удалось создать отправление Ozon",
      message,
      detail: shopEventJsonDetail({
        error: shopEventErrorDetail(error),
        previous_error: previousError
          ? shopEventErrorDetail(previousError)
          : null,
      }),
      order_id: orderId,
      shop_number: metadata.shop_number
        ? String(metadata.shop_number)
        : order.display_id
          ? String(order.display_id)
          : null,
    })
    try {
      await saveMeta({
        ...metadata,
        ozon_create_error: raw.slice(0, 1500),
        ozon_seller_create_uncertain:
          metadata.ozon_seller_create_uncertain === true ||
          ozonSellerCreateRequestStarted(error),
        ...ozonCreateRetryMetadata(metadata),
      })
    } catch {
      // Metadata write is best-effort after a failed create.
    }
    return { status: "failed", message } as const
  }

  async function createWithDeliveryApi(reason: string, previousError?: unknown) {
    if (!deliveryConfig) {
      return recordCreateFailure(
        new Error("Ozon Delivery API не настроен")
      )
    }
    if (metadata.ozon_seller_create_uncertain === true) {
      return recordCreateFailure(
        new Error(
          "Seller API запрос создания мог быть принят Ozon; безопасный переход в Delivery API невозможен"
        )
      )
    }
    const phone = normalizeOzonPhone(address.phone)
    if (!phone) {
      return recordCreateFailure(
        new Error("Проверьте телефон получателя для Ozon Delivery API")
      )
    }
    try {
      const deliveryPoint = await matchOzonDeliveryApiPoint({
        config: deliveryConfig,
        address: String(
          metadata.ozon_point_address || address.address_1 || ""
        ),
        lat: Number(metadata.ozon_point_lat),
        lon: Number(metadata.ozon_point_lon),
      })
      if (!deliveryPoint) {
        throw new MedusaError(
          MedusaError.Types.INVALID_DATA,
          "Не удалось безопасно сопоставить выбранный пункт выдачи с Ozon Delivery API"
        )
      }
      const idempotencyKey =
        String(metadata.ozon_delivery_idempotency_key || "").trim() ||
        newOzonDeliveryIdempotencyKey()
      metadata = {
        ...metadata,
        ozon_provider: "delivery_api",
        ozon_delivery_point_id: deliveryPoint.id,
        ozon_delivery_idempotency_key: idempotencyKey,
      }
      await saveMeta(metadata)
      const rawItems = (order.items as Array<Record<string, unknown>>) || []
      const description = rawItems
        .map((item) => `${String(item.title || "Товар")} × ${Number(item.quantity || 1)}`)
        .join(", ")
        .slice(0, 500)
      const shippingTotal = shopOrderShipping(order) ?? 0
      const created = await createOzonDeliveryApiOrder({
        config: deliveryConfig,
        idempotencyKey,
        orderExternalId: String(
          metadata.shop_number || order.display_id || order.id
        ),
        postingExternalId: `${String(
          metadata.shop_number || order.display_id || order.id
        )}-1`,
        buyer: { name, phone: `+${phone}` },
        pointId: deliveryPoint.id,
        description: description || "Заказ миниатюр",
        declaredValue: Math.max(0, money(order.total) - shippingTotal),
      })
      const ids = extractOzonCreateIds(created)
      const next = {
        ...metadata,
        ozon_order_number: ids.orderNumber,
        ozon_posting_number: ids.postingNumber,
        ozon_tracking: ids.trackingUrl,
        ozon_posting_status: created.status,
        ozon_create_error: null,
        ozon_create_attempts: 0,
        ozon_create_retry_after: null,
        ozon_seller_create_uncertain: false,
        ozon_create_raw: JSON.stringify({ provider: "delivery_api", ids }).slice(
          0,
          2000
        ),
      }
      await saveMeta(next)
      await recordShopEvent(container, {
        kind: "ozon_create",
        title: "Отправление создано в Ozon Delivery API",
        message: `Номер отправления ${ids.postingNumber}`,
        detail: shopEventJsonDetail({
          reason,
          seller_error: previousError
            ? shopEventErrorDetail(previousError)
            : null,
          ids,
          created,
        }),
        order_id: orderId,
        shop_number: metadata.shop_number
          ? String(metadata.shop_number)
          : order.display_id
            ? String(order.display_id)
            : null,
        posting_number: ids.postingNumber,
      })
      return {
        status: "created",
        message: `Отправление создано: ${ids.postingNumber}`,
      } as const
    } catch (error) {
      return recordCreateFailure(error, previousError)
    }
  }

  if (metadata.ozon_provider === "delivery_api") {
    return createWithDeliveryApi("повтор Delivery API по сохранённому ключу")
  }
  if (!ozonSellerReady(creds)) {
    return createWithDeliveryApi("Seller API недоступен до создания заказа")
  }

  let items: Awaited<ReturnType<typeof ozonOrderItemsForCreate>>
  try {
    items = await ozonOrderItemsForCreate(
      (order.items as Array<Record<string, unknown>>) || [],
      money,
      async (ids) => {
        const productModule = container.resolve(Modules.PRODUCT)
        const rows = await productModule.listProductVariants(
          { id: ids },
          { select: ["id", "sku", "barcode", "metadata"] }
        )
        return rows.map((row) => ({
          id: row.id,
          sku: row.sku,
          barcode: row.barcode,
          metadata: (row.metadata || {}) as Record<string, unknown>,
        }))
      }
    )
  } catch (error) {
    if (deliveryConfig && metadata.ozon_seller_create_uncertain !== true) {
      return createWithDeliveryApi("ошибка подготовки Seller API до запроса создания")
    }
    return recordCreateFailure(error)
  }

  const missing = items.filter((item) => !item.article)
  if (missing.length) {
    const labels = missing.map((item) => item.name).join(", ")
    if (deliveryConfig && metadata.ozon_seller_create_uncertain !== true) {
      return createWithDeliveryApi(`у товарных позиций нет артикула Seller API: ${labels}`)
    }
    return recordCreateFailure(
      new Error(`Нет артикула Ozon у позиций: ${labels}`)
    )
  }

  let sellerCreateRequestStarted = false
  try {
    const created = await createOzonDeliveryOrder({
      creds,
      orderNumber: String(
        metadata.shop_number || order.display_id || order.id
      ),
      buyer: {
        name,
        phone,
        email: order.email ? String(order.email) : undefined,
      },
      point: {
        id: pointId,
        address: String(
          metadata.ozon_point_address || address.address_1 || ""
        ),
      },
      amount: money(order.total),
      shippingTotal: shopOrderShipping(order) ?? undefined,
      items,
      onCreateRequestStart: async () => {
        sellerCreateRequestStarted = true
        metadata = {
          ...metadata,
          ozon_provider: "seller",
          ozon_seller_create_uncertain: true,
        }
        await saveMeta(metadata)
      },
    })
    const ids = extractOzonCreateIds(created)
    await saveMeta({
      ...metadata,
      ozon_provider: "seller",
      ozon_order_number: ids.orderNumber,
      ozon_posting_number: ids.postingNumber,
      ozon_tracking: ids.trackingUrl,
      ozon_create_error: null,
      ozon_create_attempts: 0,
      ozon_create_retry_after: null,
      ozon_seller_create_uncertain: false,
      ozon_create_raw: JSON.stringify({
        ids,
        created: {
          order_number: ids.orderNumber,
          posting_number: ids.postingNumber,
        },
      }).slice(0, 2000),
    })
    await recordShopEvent(container, {
      kind: "ozon_create",
      title: "Отправление создано в Ozon",
      message: ids.postingNumber
        ? `Номер отправления ${ids.postingNumber}`
        : "Ozon принял заказ",
      detail: shopEventJsonDetail({
        ids,
        created,
        requests: created.ozon_requests,
      }),
      order_id: orderId,
      shop_number: metadata.shop_number
        ? String(metadata.shop_number)
        : order.display_id
          ? String(order.display_id)
          : null,
      posting_number: ids.postingNumber,
    })
    return {
      status: "created",
      message: ids.postingNumber
        ? `Отправление создано: ${ids.postingNumber}`
        : "Заказ передан в Ozon",
    }
  } catch (error) {
    const sellerCreateMayHaveSucceeded =
      sellerCreateRequestStarted || ozonSellerCreateRequestStarted(error)
    if (
      deliveryConfig &&
      metadata.ozon_seller_create_uncertain !== true &&
      !sellerCreateMayHaveSucceeded
    ) {
      const result = await createWithDeliveryApi(
        "ошибка Seller API до отправки /v2/order/create",
        error
      )
      if (result.status !== "failed") return result
      return result
    }
    if (sellerCreateMayHaveSucceeded) {
      const markedError =
        error instanceof Error ? error : new Error(String(error))
      ;(
        markedError as Error & { ozonSellerCreateRequestStarted?: boolean }
      ).ozonSellerCreateRequestStarted = true
      return recordCreateFailure(markedError)
    }
    return recordCreateFailure(error)
  }
}

export default async function orderPlacedOzon({
  event,
  container,
}: SubscriberArgs<{ id: string }>) {
  await createOzonOrderForMedusaOrder(container, event.data.id)
}

export const config: SubscriberConfig = {
  event: "order.placed",
}
