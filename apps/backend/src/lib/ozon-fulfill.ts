import { MedusaContainer } from "@medusajs/framework"
import { MedusaError, Modules } from "@medusajs/framework/utils"
import {
  createOzonDeliveryOrder,
  extractOzonCreateIds,
  ozonCredsFromRow,
  ozonTrackingUrl,
  type OzonCreds,
} from "./ozon-delivery"
import {
  cancelOzonPosting,
  getOzonPackageLabel,
  getOzonPosting,
  handOverOzonPosting,
  mapOzonPostingStatus,
  ozonReturnKind,
  shipOzonPosting,
  type OzonReturnKind,
} from "./ozon-posting"
import { orderLogContext, recordShopEvent } from "./shop-event"
import { getShopSetting } from "./shop-setting"

async function saveOrderMetadata(
  container: MedusaContainer,
  orderId: string,
  metadata: Record<string, unknown>
) {
  const orderModule = container.resolve(Modules.ORDER) as {
    updateOrders: (
      id: string,
      data: { metadata: Record<string, unknown> }
    ) => Promise<unknown>
  }
  await orderModule.updateOrders(orderId, { metadata })
}

function text(value: unknown) {
  return String(value || "").trim()
}

function money(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (value && typeof value === "object") {
    const rec = value as { numeric?: unknown }
    if (typeof rec.numeric === "number") return rec.numeric
  }
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : 0
}

export async function ozonCreds(container: MedusaContainer): Promise<OzonCreds | null> {
  const row = (await getShopSetting(container)) as unknown as Record<string, unknown>
  return ozonCredsFromRow(row)
}

export async function loadShopOrder(
  container: MedusaContainer,
  orderId: string,
  extraFields: string[] = []
) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "order",
    fields: [
      "id",
      "status",
      "display_id",
      "email",
      "total",
      "metadata",
      "items.id",
      "items.title",
      "items.quantity",
      "items.unit_price",
      "items.variant.sku",
      "items.variant.product.title",
      "items.thumbnail",
      "shipping_total",
      "created_at",
      "currency_code",
      "shipping_address.first_name",
      "shipping_address.last_name",
      "shipping_address.phone",
      "shipping_address.address_1",
      "shipping_address.address_2",
      "shipping_address.company",
      "fulfillments.id",
      "fulfillments.canceled_at",
      "fulfillments.shipped_at",
      "fulfillments.delivered_at",
      "fulfillments.labels.label_url",
      "payment_collections.status",
      "payment_collections.payments.captured_at",
      "payment_collections.payments.captures.id",
      ...extraFields,
    ],
    filters: { id: orderId },
  })
  return ((data ?? [])[0] || null) as Record<string, unknown> | null
}

async function storeOzonLabel(
  container: MedusaContainer,
  postingNumber: string,
  bytes: Buffer,
  contentType: string
) {
  const files = container.resolve(Modules.FILE) as {
    createFiles: (data: {
      filename: string
      mimeType: string
      content: string
      access: "public"
    }) => Promise<{ url?: string } | Array<{ url?: string }>>
  }
  const filename = `ozon-label-${postingNumber.replace(/[^\w.-]+/g, "-")}.pdf`
  const created = await files.createFiles({
    filename,
    mimeType: contentType || "application/pdf",
    content: bytes.toString("base64"),
    access: "public",
  })
  const file = Array.isArray(created) ? created[0] : created
  return file?.url || null
}

async function ensureOzonIds(
  container: MedusaContainer,
  order: Record<string, unknown>,
  creds: OzonCreds
) {
  const metadata = (order.metadata || {}) as Record<string, unknown>
  if (text(metadata.ozon_posting_number) || text(metadata.ozon_order_number)) {
    return metadata
  }
  const address = (order.shipping_address || {}) as Record<string, unknown>
  const pointId = text(metadata.ozon_point_id || address.company)
  if (!pointId) return metadata
  const name =
    [address.first_name, address.last_name].filter(Boolean).join(" ").trim() ||
    "Покупатель"
  const items = ((order.items as Array<Record<string, unknown>>) || []).map(
    (item) => {
      const variant = (item.variant || {}) as Record<string, unknown>
      const product = (variant.product || {}) as Record<string, unknown>
      return {
        article: String(variant.sku || item.id || "sku"),
        name: String(product.title || item.title || "Товар"),
        quantity: Number(item.quantity || 1),
        price: money(item.unit_price),
      }
    }
  )
  const created = await createOzonDeliveryOrder({
    creds,
    orderNumber: String(metadata.shop_number || order.display_id || order.id),
    buyer: {
      name,
      phone: String(address.phone || ""),
      email: order.email ? String(order.email) : undefined,
    },
    point: {
      id: pointId,
      address: String(metadata.ozon_point_address || address.address_1 || ""),
    },
    amount: money(order.total),
    items,
  })
  const ids = extractOzonCreateIds(created)
  return {
    ...metadata,
    ozon_order_number: ids.orderNumber,
    ozon_posting_number: ids.postingNumber,
    ozon_tracking: ids.trackingUrl,
    ozon_create_error: null,
  }
}

export async function packOzonForOrder(
  container: MedusaContainer,
  orderId: string
) {
  const creds = await ozonCreds(container)
  if (!creds) return null
  const order = await loadShopOrder(container, orderId)
  if (!order) return null
  let metadata = (order.metadata || {}) as Record<string, unknown>
  if (metadata.ozon_packed_at && metadata.ozon_label_url) {
    return metadata
  }
  metadata = await ensureOzonIds(container, { ...order, metadata }, creds)
  const postingNumber = text(
    metadata.ozon_posting_number || metadata.ozon_order_number
  )
  if (!postingNumber) {
    await saveOrderMetadata(container, orderId, {
      ...metadata,
      ozon_pack_error: "Нет номера отправления Ozon",
    })
    await recordShopEvent(container, {
      kind: "ozon_pack",
      level: "error",
      title: "Сборка в Ozon не удалась",
      message: "Нет номера отправления Ozon",
      ...orderLogContext(order),
    })
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Нет номера отправления Ozon"
    )
  }
  let posting
  let number = postingNumber
  try {
    posting = await getOzonPosting(creds, postingNumber)
    number = posting.postingNumber || postingNumber
    try {
      await shipOzonPosting(creds, { ...posting, postingNumber: number })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (!/already|ожидает|awaiting_deliver|packed/i.test(message)) {
        throw error
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await recordShopEvent(container, {
      kind: "ozon_pack",
      level: "error",
      title: "Сборка в Ozon не удалась",
      message,
      ...orderLogContext(order),
    })
    throw error
  }
  let label
  try {
    label = await getOzonPackageLabel(creds, number)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await recordShopEvent(container, {
      kind: "ozon_pack",
      level: "error",
      title: "Не удалось получить этикетку Ozon",
      message,
      ...orderLogContext(order),
      posting_number: number,
    })
    throw error
  }
  const labelUrl = await storeOzonLabel(
    container,
    number,
    label.bytes,
    label.contentType
  )
  const next = {
    ...metadata,
    ozon_posting_number: number,
    ozon_order_number:
      posting.orderNumber || metadata.ozon_order_number || null,
    ozon_tracking:
      metadata.ozon_tracking ||
      ozonTrackingUrl(posting.orderNumber || metadata.ozon_order_number),
    ozon_posting_status: posting.status || "awaiting_deliver",
    ozon_label_url: labelUrl,
    ozon_label_name: label.fileName,
    ozon_packed_at: new Date().toISOString(),
    ozon_pack_error: null,
  }
  await saveOrderMetadata(container, orderId, next)
  await recordShopEvent(container, {
    kind: "ozon_pack",
    title: "Заказ собран в Ozon",
    message: labelUrl
      ? "Этикетка получена. Можно сдавать в ПВЗ."
      : "Сборка подтверждена, этикетка не сохранилась.",
    ...orderLogContext({ ...order, metadata: next }),
    to_status: "awaiting_deliver",
  })
  const { sendShopOrderMail } = await import("./order-mail")
  await sendShopOrderMail(container, orderId, "packed")
  return next
}

export async function handOverOzonForOrder(
  container: MedusaContainer,
  orderId: string
) {
  const creds = await ozonCreds(container)
  if (!creds) return null
  const order = await loadShopOrder(container, orderId)
  if (!order) return null
  const metadata = (order.metadata || {}) as Record<string, unknown>
  const postingNumber = text(
    metadata.ozon_posting_number || metadata.ozon_order_number
  )
  if (!postingNumber) return metadata
  try {
    await handOverOzonPosting(creds, postingNumber)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (!/already|delivering|handed/i.test(message)) {
      throw error
    }
  }
  const next = {
    ...metadata,
    ozon_posting_status: "delivering",
  }
  await saveOrderMetadata(container, orderId, next)
  return next
}

export async function cancelOzonForOrder(
  container: MedusaContainer,
  orderId: string
) {
  const creds = await ozonCreds(container)
  if (!creds) return
  const order = await loadShopOrder(container, orderId)
  if (!order) return
  const metadata = (order.metadata || {}) as Record<string, unknown>
  const postingNumber = text(
    metadata.ozon_posting_number || metadata.ozon_order_number
  )
  if (!postingNumber) return
  try {
    await cancelOzonPosting(creds, postingNumber)
    await saveOrderMetadata(container, orderId, {
      ...metadata,
      ozon_posting_status: "cancelled",
    })
  } catch {
    // Ozon may already have cancelled the posting.
  }
}

export async function syncOzonPostingForOrder(
  container: MedusaContainer,
  orderId: string
) {
  const creds = await ozonCreds(container)
  if (!creds) return null
  const order = await loadShopOrder(container, orderId)
  if (!order) return null
  const metadata = (order.metadata || {}) as Record<string, unknown>
  const postingNumber = text(
    metadata.ozon_posting_number || metadata.ozon_order_number
  )
  if (!postingNumber) return null
  const posting = await getOzonPosting(creds, postingNumber)
  const previousRaw = text(metadata.ozon_posting_status) || null
  const mapped = mapOzonPostingStatus(posting.status, previousRaw)
  const storedKind = text(metadata.ozon_return_kind)
  const kind: OzonReturnKind | null =
    ozonReturnKind(posting.status, previousRaw) ||
    (storedKind === "unclaimed" ||
    storedKind === "refused" ||
    storedKind === "returned"
      ? storedKind
      : null)
  const unchanged =
    text(posting.status) === text(previousRaw) &&
    text(kind) === storedKind
  if (unchanged) {
    return {
      order,
      mapped,
      posting,
      changed: false,
      previousRaw,
      kind: kind || null,
    }
  }
  const next = {
    ...metadata,
    ozon_posting_number: posting.postingNumber || postingNumber,
    ozon_order_number: posting.orderNumber || metadata.ozon_order_number,
    ozon_posting_status: posting.status,
    ozon_return_kind: kind || metadata.ozon_return_kind || null,
  }
  await saveOrderMetadata(container, orderId, next)
  return {
    order: { ...order, metadata: next },
    mapped,
    posting,
    changed: true,
    previousRaw,
    kind: kind || null,
  }
}

export async function getStoredOzonLabel(
  container: MedusaContainer,
  orderId: string
) {
  const order = await loadShopOrder(container, orderId)
  if (!order) return null
  const metadata = (order.metadata || {}) as Record<string, unknown>
  const storedUrl = text(metadata.ozon_label_url)
  const postingNumber = text(
    metadata.ozon_posting_number || metadata.ozon_order_number
  )
  if (storedUrl) {
    try {
      const response = await fetch(storedUrl)
      if (response.ok) {
        const bytes = Buffer.from(await response.arrayBuffer())
        if (bytes.length) {
          return {
            bytes,
            contentType:
              response.headers.get("content-type") || "application/pdf",
            fileName: text(metadata.ozon_label_name) || `ozon-${postingNumber || orderId}.pdf`,
          }
        }
      }
    } catch {
      // Fall through to a live Ozon fetch.
    }
  }
  const creds = await ozonCreds(container)
  if (!creds || !postingNumber) return null
  const label = await getOzonPackageLabel(creds, postingNumber)
  const labelUrl = await storeOzonLabel(
    container,
    postingNumber,
    label.bytes,
    label.contentType
  )
  await saveOrderMetadata(container, orderId, {
    ...metadata,
    ozon_label_url: labelUrl,
    ozon_label_name: label.fileName,
  })
  return label
}
