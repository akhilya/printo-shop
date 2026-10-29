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
  substatus: string | null
  cancelReason: string | null
  products: Array<{ productId: number; quantity: number }>
}

export type OzonReturnKind = "unclaimed" | "refused" | "returned"

export type OzonReturnRow = {
  postingNumber: string | null
  type: string | null
  visual: string | null
}

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

const DELIVERED_SUBSTATUS = new Set([
  "posting_received",
  "posting_delivered",
  "posting_conditionally_delivered",
])

const PICKUP_SUBSTATUS = new Set([
  "posting_in_pickup_point",
  "posting_on_way_to_pickup_point",
  "posting_in_courier_service",
  "posting_on_way_to_city",
  "posting_transferred_to_courier_service",
])

/** Return is agreed or already on the way back, not merely waiting for a decision. */
const AGREED_RETURN_VISUAL = new Set([
  "approved",
  "approvedbyozon",
  "movingtoseller",
  "arrivedatreturnplace",
  "returningtosellerbycourier",
  "receivedbyseller",
  "moneyreturned",
  "moneyreturnedbysystem",
  "returncompensated",
  "partialcompensationinprocess",
  "waitingshipment",
  "utilizing",
  "utilized",
  "returnedtoozon",
  "movingtoozon",
  "согласован",
  "согласовано",
  "одобрен",
  "одобрено",
])

function compactStatus(raw?: string | null) {
  return normOzonStatus(raw).replace(/_/g, "")
}

export function unclaimedCancelReason(reason?: string | null) {
  return /не забрал|невостреб|срок хранен|ист[её]к.*хранен|не получил заказ/i.test(
    String(reason || "")
  )
}

/** Substatus carries pickup and receipt when the main status stays on delivering. */
export function signalOzonPostingStatus(
  status?: string | null,
  substatus?: string | null
) {
  const sub = normOzonStatus(substatus)
  if (DELIVERED_SUBSTATUS.has(sub)) return "delivered"
  if (sub === "posting_in_pickup_point") return "in_pickup_point"
  if (PICKUP_SUBSTATUS.has(sub)) return "delivering"
  return status || null
}

export function ozonAgreedReturn(
  type?: string | null,
  visual?: string | null
): OzonReturnKind | null {
  if (!AGREED_RETURN_VISUAL.has(compactStatus(visual))) return null
  const kind = compactStatus(type)
  if (kind === "cancellation") return "unclaimed"
  if (kind === "fullreturn" || kind === "partialreturn") return "refused"
  return "returned"
}

export function pickAgreedOzonReturn(rows: OzonReturnRow[]) {
  for (const row of rows) {
    const kind = ozonAgreedReturn(row.type, row.visual)
    if (kind) return { ...row, kind }
  }
  return null
}

export function ozonReturnKind(
  raw?: string | null,
  previous?: string | null,
  cancelReason?: string | null
): OzonReturnKind | null {
  if (unclaimedCancelReason(cancelReason)) return "unclaimed"
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
    case "created":
    case "awaiting_packaging":
    case "awaiting_approve":
    case "registered":
      return "awaiting_pack"
    case "awaiting_deliver":
    case "awaiting_registration":
    case "arbitration":
    case "ready_for_shipping":
      return "awaiting_deliver"
    case "forming":
    case "forming_failed":
      return "awaiting_pack"
    case "in_container":
    case "delivering":
    case "acceptance_in_progress":
    case "driver_pickup":
    case "in_transit":
    case "on_way":
    case "sent":
    case "posting_in_pickup_point":
    case "in_pickup_point":
    case "in_delivery_point":
    case "in_courier_service":
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
    case "not_accepted_to_delivery":
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
  const status =
    firstText(
      result.status,
      rec.status,
      result.tracking_status,
      tracking?.status,
      tracking?.event
    ) || null
  const substatus = firstText(result.substatus, rec.substatus)
  return signalOzonPostingStatus(status, substatus)
}

function postingCancelReason(raw: unknown) {
  const rec = asRecord(raw) || {}
  const result = asRecord(rec.result) || rec
  const cancellation =
    asRecord(result.cancellation) || asRecord(rec.cancellation) || {}
  return (
    firstText(
      cancellation.cancel_reason,
      cancellation.cancellation_reason,
      result.cancel_reason,
      rec.cancel_reason
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
    substatus:
      firstText(
        asRecord(result)?.substatus,
        asRecord(rec)?.substatus
      ) || null,
    cancelReason: postingCancelReason(raw),
    products: postingProducts(raw),
  }
}

export function parseOzonReturns(raw: unknown): OzonReturnRow[] {
  const rec = asRecord(raw) || {}
  const rows = Array.isArray(rec.returns) ? rec.returns : []
  return rows
    .map((row) => {
      const item = asRecord(row) || {}
      const visual = asRecord(item.visual) || {}
      const visualStatus = asRecord(visual.status) || {}
      return {
        postingNumber: firstText(item.posting_number) || null,
        type: firstText(item.type) || null,
        visual: firstText(visualStatus.sys_name, visualStatus.display_name) || null,
      }
    })
    .filter((row) => row.postingNumber || row.visual || row.type)
}

export async function listOzonReturns(
  creds: OzonCreds,
  postingNumber: string
): Promise<OzonReturnRow[]> {
  const number = String(postingNumber || "").trim()
  if (!number) return []
  try {
    const raw = await sellerPost(creds, "/v1/returns/list", {
      filter: { posting_numbers: [number] },
      limit: 50,
    })
    return parseOzonReturns(raw)
  } catch {
    return []
  }
}

function isPdf(contentType: string, buffer: Buffer) {
  if (/pdf/i.test(contentType)) return true
  return buffer.subarray(0, 4).toString("utf8") === "%PDF"
}

export function ozonErrorCode(error: unknown) {
  const raw =
    error instanceof Error
      ? error.message
      : error && typeof error === "object" && "message" in error
        ? String((error as { message: unknown }).message || "")
        : String(error || "")
  const jsonStart = raw.indexOf("{")
  if (jsonStart >= 0) {
    try {
      const json = JSON.parse(raw.slice(jsonStart)) as Record<string, unknown>
      return String(json.message || json.code || "").trim()
    } catch {
      // fall through
    }
  }
  return raw
}

export function ozonShipAlreadyPacked(error: unknown) {
  return /POSTING_ALREADY_SHIPPED|HAS_INCORRECT_STATUS|TRANSITION_IS_NOT_POSSIBLE/i.test(
    ozonErrorCode(error)
  )
}

export function ozonLabelNotReady(error: unknown) {
  const code = ozonErrorCode(error)
  return /INVALID_ARGUMENT|aren't ready|NO_POSTINGS_FOR_BATCH_DOWNLOAD/i.test(code)
}

export function ozonPostingReadyForLabel(status?: string | null) {
  const mapped = mapOzonPostingStatus(status)
  return (
    mapped === "awaiting_deliver" ||
    mapped === "delivering" ||
    mapped === "delivered"
  )
}

function bytesFromLabelContent(value: unknown) {
  const text = String(value || "")
  if (!text) return Buffer.alloc(0)
  if (text.startsWith("%PDF")) return Buffer.from(text, "utf8")
  try {
    const decoded = Buffer.from(text, "base64")
    if (decoded.length && (isPdf("", decoded) || decoded.length > 32)) {
      return decoded
    }
  } catch {
    // use the raw string
  }
  return Buffer.from(text, "utf8")
}

export function parseOzonLabelResponse(
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
  const text = raw.buffer.toString("utf8").trim()
  if (text.startsWith("{")) {
    try {
      const json = JSON.parse(text) as Record<string, unknown>
      const result = (json.result || json) as Record<string, unknown>
      const content = result.file_content || json.file_content
      const bytes = bytesFromLabelContent(content)
      if (bytes.length) {
        const name = String(
          result.file_name || json.file_name || `ozon-${postingNumber}.pdf`
        )
        return {
          bytes,
          contentType: String(
            result.content_type || json.content_type || "application/pdf"
          ),
          fileName: name,
        }
      }
    } catch {
      // fall through to a raw PDF
    }
  }
  const pdf = isPdf(raw.contentType, raw.buffer)
  return {
    bytes: raw.buffer,
    contentType: pdf ? "application/pdf" : raw.contentType || "application/pdf",
    fileName: `ozon-${postingNumber}.${pdf ? "pdf" : "bin"}`,
  }
}

export async function waitForOzonAwaitingDeliver(
  fetchPosting: () => Promise<OzonPostingInfo>,
  options?: {
    attempts?: number
    delayMs?: number
    sleep?: (ms: number) => Promise<void>
  }
) {
  const attempts = options?.attempts ?? 12
  const delayMs = options?.delayMs ?? 2500
  const sleep =
    options?.sleep || ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)))
  let posting = await fetchPosting()
  if (ozonPostingReadyForLabel(posting.status)) return posting
  for (let i = 0; i < attempts; i++) {
    await sleep(delayMs)
    posting = await fetchPosting()
    if (ozonPostingReadyForLabel(posting.status)) return posting
  }
  return posting
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
  try {
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
  } catch (error) {
    if (!ozonShipAlreadyPacked(error)) throw error
    const fresh = await getOzonPosting(creds, postingNumber)
    if (ozonPostingReadyForLabel(fresh.status)) return fresh
    throw error
  }
}

export async function handOverOzonPosting(creds: OzonCreds, postingNumber: string) {
  await sellerPost(creds, "/v2/posting/fbs/awaiting-delivery", {
    posting_number: [postingNumber],
  })
}

export function ozonAlreadyCancelled(error: unknown) {
  return /ALREADY_CANCEL+ED|POSTING_IS_CANCELED|ORDER_IS_CANCELED|CANCELLED_POSTING/i.test(
    ozonErrorCode(error)
  )
}

export async function cancelOzonPosting(
  creds: OzonCreds,
  postingNumber: string,
  orderNumber?: string
) {
  const posting = String(postingNumber || "").trim()
  const order = String(orderNumber || "").trim()
  const errors: unknown[] = []
  if (posting) {
    try {
      await sellerPost(creds, "/v2/posting/fbs/cancel", ozonFbsCancelBody(posting))
      return
    } catch (error) {
      if (ozonAlreadyCancelled(error)) return
      errors.push(error)
    }
  }
  if (order) {
    try {
      await sellerPost(creds, "/v1/order/cancel", ozonOrderCancelBody(order))
      return
    } catch (error) {
      if (ozonAlreadyCancelled(error)) return
      errors.push(error)
    }
  }
  const last = errors[errors.length - 1]
  if (last) throw last
}

export async function getOzonPackageLabel(
  creds: OzonCreds,
  postingNumber: string
): Promise<OzonPackageLabel> {
  const raw = await sellerRequest(creds, "/v2/posting/fbs/package-label", {
    posting_number: [postingNumber],
  })
  return parseOzonLabelResponse(raw, postingNumber)
}

export function ozonLabelTracking(orderNumber?: string | null) {
  return ozonTrackingUrl(orderNumber) || ""
}
