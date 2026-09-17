import { MedusaError } from "@medusajs/framework/utils"
import {
  asRecord,
  firstText,
  listOzonPostingsByOrder,
  ozonTrackingUrl,
  sellerPost,
  sellerRequest,
  type OzonCreds,
} from "./ozon-delivery"

export type OzonPackageLabel = {
  bytes: Buffer
  contentType: string
  fileName: string
}

export type OzonPostingInfo = {
  postingNumber: string | null
  orderNumber: string | null
  status: string | null
  products: Array<{ productId: number; quantity: number }>
}

export type OzonReturnKind = "unclaimed" | "refused" | "returned"

function normOzonStatus(raw?: string | null) {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_")
}

function isCancelStatus(key: string) {
  return key === "cancelled" || key === "canceled"
}

function isReturnFlowStatus(key: string) {
  return (
    key === "returned" ||
    key === "returning" ||
    key === "not_accepted" ||
    key === "given_to_seller" ||
    key === "sent_to_seller" ||
    key === "on_way_to_return"
  )
}

function wasHandedToOzon(previous?: string | null) {
  const mapped = mapOzonPostingStatus(previous)
  return (
    mapped === "awaiting_deliver" ||
    mapped === "delivering" ||
    mapped === "delivered" ||
    mapped === "returned"
  )
}

export function ozonReturnKind(
  raw?: string | null,
  previous?: string | null
): OzonReturnKind | null {
  const key = normOzonStatus(raw)
  if (key === "not_accepted") return "refused"
  if (isCancelStatus(key) && wasHandedToOzon(previous)) return "unclaimed"
  if (
    key === "returned" ||
    key === "returning" ||
    key === "given_to_seller" ||
    key === "sent_to_seller" ||
    key === "on_way_to_return"
  ) {
    return "returned"
  }
  return null
}

export function ozonReturnMessage(kind: OzonReturnKind | null) {
  switch (kind) {
    case "unclaimed":
      return "Покупатель не забрал заказ на ПВЗ. Отправление возвращается вам."
    case "refused":
      return "Покупатель отказался от заказа на пункте выдачи. Отправление возвращается вам."
    case "returned":
      return "Ozon вернул отправление в пункт сдачи."
    default:
      return null
  }
}

export function mapOzonPostingStatus(
  raw?: string | null,
  previous?: string | null
) {
  const key = normOzonStatus(raw)
  switch (key) {
    case "awaiting_packaging":
    case "awaiting_approve":
    case "created":
    case "registered":
      return "awaiting_pack"
    case "awaiting_deliver":
    case "awaiting_registration":
    case "arbitration":
      return "awaiting_deliver"
    case "delivering":
    case "driver_pickup":
    case "in_transit":
    case "on_way":
    case "sent":
    case "posting_in_pickup_point":
    case "in_pickup_point":
      return "delivering"
    case "delivered":
    case "received":
    case "posting_received":
      return "delivered"
    case "returned":
    case "returning":
    case "not_accepted":
    case "given_to_seller":
    case "sent_to_seller":
    case "on_way_to_return":
      return "returned"
    case "cancelled":
    case "canceled":
      return wasHandedToOzon(previous) ? "returned" : "cancelled"
    default:
      return isReturnFlowStatus(key) ? "returned" : null
  }
}

export function extractOzonPostingStatus(raw: unknown): string | null {
  const rec = asRecord(raw) || {}
  const result = asRecord(rec.result) || rec
  const tracking = asRecord(result.tracking) || asRecord(rec.tracking)
  return (
    firstText(
      result.status,
      rec.status,
      result.tracking_status,
      tracking?.status,
      tracking?.event
    ) || null
  )
}

function postingProducts(raw: unknown): Array<{ productId: number; quantity: number }> {
  const rec = asRecord(raw) || {}
  const result = asRecord(rec.result) || rec
  const rows = Array.isArray(result.products)
    ? result.products
    : Array.isArray(rec.products)
      ? rec.products
      : []
  return rows
    .map((row) => {
      const item = asRecord(row) || {}
      const productId = Number(item.product_id || item.sku || 0)
      const quantity = Math.max(1, Number(item.quantity || 1))
      return { productId, quantity }
    })
    .filter((row) => row.productId > 0)
}

export function parseOzonPosting(raw: unknown): OzonPostingInfo {
  const rec = asRecord(raw) || {}
  const result = asRecord(rec.result) || rec
  const postingNumber =
    firstText(
      result.posting_number,
      result.postingNumber,
      rec.posting_number,
      rec.postingNumber
    ) || null
  const orderNumber =
    firstText(
      result.order_number,
      result.orderNumber,
      rec.order_number,
      rec.orderNumber
    ) || null
  return {
    postingNumber,
    orderNumber,
    status: extractOzonPostingStatus(raw),
    products: postingProducts(raw),
  }
}

function isPdf(contentType: string, buffer: Buffer) {
  if (/pdf/i.test(contentType)) return true
  return buffer.subarray(0, 4).toString("utf8") === "%PDF"
}

function labelFromRaw(
  raw: { ok: boolean; status: number; contentType: string; buffer: Buffer },
  postingNumber: string
): OzonPackageLabel {
  if (!raw.ok) {
    throw new MedusaError(
      MedusaError.Types.UNEXPECTED_STATE,
      `Ozon HTTP ${raw.status}: ${raw.buffer.toString("utf8").slice(0, 240)}`
    )
  }
  if (!raw.buffer.length) {
    throw new MedusaError(
      MedusaError.Types.UNEXPECTED_STATE,
      "Ozon вернул пустую этикетку"
    )
  }
  const pdf = isPdf(raw.contentType, raw.buffer)
  return {
    bytes: raw.buffer,
    contentType: pdf ? "application/pdf" : raw.contentType || "application/pdf",
    fileName: `ozon-${postingNumber}.${pdf ? "pdf" : "bin"}`,
  }
}

export async function getOzonPosting(
  creds: OzonCreds,
  postingNumber: string,
  orderNumber?: string
): Promise<OzonPostingInfo> {
  const number = String(postingNumber || "").trim()
  if (number) {
    try {
      const raw = await sellerPost(creds, "/v3/posting/fbs/get", {
        posting_number: number,
        with: { analytics_data: true },
      })
      return parseOzonPosting(raw)
    } catch (error) {
      if (!orderNumber) throw error
    }
  }
  const order = String(orderNumber || "").trim()
  if (!order) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Нет номера отправления Ozon"
    )
  }
  const listed = await listOzonPostingsByOrder(creds, order)
  const found = listed[0]
  if (!found) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      "Нет номера отправления Ozon"
    )
  }
  const raw = await sellerPost(creds, "/v3/posting/fbs/get", {
    posting_number: found,
    with: { analytics_data: true },
  })
  return parseOzonPosting(raw)
}

export function ozonOrderCancelBody(orderNumber: string) {
  return {
    order_number: orderNumber,
    reason_id: 508,
  }
}

export function ozonFbsCancelBody(postingNumber: string) {
  return {
    posting_number: postingNumber,
    cancel_reason_id: 402,
    cancel_reason_message: "Отмена заказа магазином",
  }
}

export async function shipOzonPosting(
  creds: OzonCreds,
  posting: OzonPostingInfo
) {
  const postingNumber = posting.postingNumber
  if (!postingNumber) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Нет номера отправления Ozon"
    )
  }
  const mapped = mapOzonPostingStatus(posting.status)
  if (mapped === "awaiting_deliver" || mapped === "delivering" || mapped === "delivered") {
    return posting
  }
  if (!posting.products.length) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "В отправлении Ozon нет товаров для сборки"
    )
  }
  await sellerPost(creds, "/v4/posting/fbs/ship", {
    posting_number: postingNumber,
    packages: [
      {
        products: posting.products.map((product) => ({
          product_id: product.productId,
          quantity: product.quantity,
        })),
      },
    ],
  })
  return { ...posting, status: "awaiting_deliver" }
}

export async function handOverOzonPosting(creds: OzonCreds, postingNumber: string) {
  await sellerPost(creds, "/v2/posting/fbs/awaiting-delivery", {
    posting_number: [postingNumber],
  })
}

export async function cancelOzonPosting(
  creds: OzonCreds,
  postingNumber: string,
  orderNumber?: string
) {
  const order = String(orderNumber || "").trim()
  if (order) {
    try {
      await sellerPost(creds, "/v1/order/cancel", ozonOrderCancelBody(order))
      return
    } catch {
      // Own-site cancel may already be done; try the FBS posting cancel.
    }
  }
  await sellerPost(creds, "/v2/posting/fbs/cancel", ozonFbsCancelBody(postingNumber))
}

export async function getOzonPackageLabel(
  creds: OzonCreds,
  postingNumber: string
): Promise<OzonPackageLabel> {
  const raw = await sellerRequest(creds, "/v2/posting/fbs/package-label", {
    posting_number: [postingNumber],
  })
  return labelFromRaw(raw, postingNumber)
}

export function ozonLabelTracking(orderNumber?: string | null) {
  return ozonTrackingUrl(orderNumber) || ""
}
