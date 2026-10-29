import { randomUUID } from "node:crypto"
import { MedusaError } from "@medusajs/framework/utils"

const OZON_DELIVERY_API_URL = "https://api-delivery.ozon.ru"
const OZON_DELIVERY_TOKEN_URL = "https://xapi.ozon.ru/oauth/token"
const DELIVERY_POINT_INFO_BATCH_SIZE = 100
const OZON_DELIVERY_SCOPES = [
  "delivery-api.delivery",
  "delivery-api.delivery-point",
  "delivery-api.order",
  "delivery-api.posting",
  "delivery-api.shipment-method",
]

export type OzonDeliveryParcel = {
  weightG: number
  lengthMm: number
  widthMm: number
  heightMm: number
}

export type OzonDeliveryApiConfig = {
  clientId: string
  clientSecret: string
  shipmentMethodId: number
  parcel: OzonDeliveryParcel
}

export type OzonDeliveryApiCredentials = Pick<
  OzonDeliveryApiConfig,
  "clientId" | "clientSecret"
>

export type OzonDeliveryApiShipmentMethod = {
  shipment_method_id: number
  name: string
  status: string | null
  type: string | null
  dropoff_point_id: number | null
  full_address: string | null
  error_code: string | null
}

export type OzonDeliveryPosting = {
  postingNumber: string
  orderNumber: string | null
  status: string | null
}

export type OzonDeliveryLabel = {
  bytes: Buffer
  contentType: string
  fileName: string
}

export type OzonDeliveryApiPoint = {
  id: string
  name: string
  address: string
  lat: number
  lon: number
  city?: string
}

export type OzonDeliveryApiPointMatchDiagnostics = {
  match_status:
    | "missing_coordinates"
    | "invalid_coordinates"
    | "no_points_for_method"
    | "no_points_within_250m"
    | "ambiguous_or_location_mismatch"
    | "matched_by_location_text"
    | "matched_by_coordinates"
  shipment_method_id: number
  source_location: {
    has_text: boolean
    has_latitude: boolean
    has_longitude: boolean
  }
  delivery_api_point_count: number
  nearby_point_count: number
  location_text_match_count: number
  nearest_points: Array<{
    delivery_point_id: string
    distance_m: number
    within_250m: boolean
    location_text_matches: boolean
  }>
}

export type OzonDeliveryApiPointMatchInput = {
  config: OzonDeliveryApiConfig
  address?: string
  lat?: number
  lon?: number
}

type DeliveryTokenCache = {
  key: string
  token: string
  expiresAt: number
}

type DeliveryFetchInput = {
  url: string
  method: "POST"
  headers?: Record<string, string>
  body: string
}

type DeliveryPointCache = {
  expiresAt: number
  points: OzonDeliveryApiPoint[]
}

let tokenCache: DeliveryTokenCache | null = null
const cookiesByHost = new Map<string, Map<string, string>>()
const deliveryPointsCache = new Map<string, DeliveryPointCache>()
const deliveryPointsInFlight = new Map<string, Promise<OzonDeliveryApiPoint[]>>()

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function valueText(...values: unknown[]) {
  for (const value of values) {
    const text = String(value ?? "").trim()
    if (text) return text
  }
  return ""
}

function positiveInt(value: unknown) {
  const number = Number(value)
  return Number.isSafeInteger(number) && number > 0 ? number : null
}

export function ozonDeliveryApiConfigFromRow(
  row: Record<string, unknown> | null | undefined
): OzonDeliveryApiConfig | null {
  if (!row) return null
  const credentials = ozonDeliveryApiCredentialsFromRow(row)
  const shipmentMethodId = positiveInt(row.ozon_delivery_shipment_method_id)
  const weightG = positiveInt(row.ozon_delivery_weight_g)
  const lengthMm = positiveInt(row.ozon_delivery_length_mm)
  const widthMm = positiveInt(row.ozon_delivery_width_mm)
  const heightMm = positiveInt(row.ozon_delivery_height_mm)
  if (
    !credentials ||
    !shipmentMethodId ||
    !weightG ||
    !lengthMm ||
    !widthMm ||
    !heightMm
  ) {
    return null
  }
  return {
    ...credentials,
    shipmentMethodId,
    parcel: { weightG, lengthMm, widthMm, heightMm },
  }
}

export function ozonDeliveryApiCredentialsFromRow(
  row: Record<string, unknown> | null | undefined
): OzonDeliveryApiCredentials | null {
  if (!row) return null
  const clientId = valueText(row.ozon_delivery_client_id)
  const clientSecret = valueText(row.ozon_delivery_client_secret)
  return clientId && clientSecret ? { clientId, clientSecret } : null
}

export function ozonDeliveryApiCredentialsSet(
  row: Record<string, unknown> | null | undefined
) {
  return Boolean(ozonDeliveryApiCredentialsFromRow(row))
}

export function newOzonDeliveryIdempotencyKey() {
  return randomUUID()
}

export function resetOzonDeliveryApiCache() {
  tokenCache = null
  cookiesByHost.clear()
  deliveryPointsCache.clear()
  deliveryPointsInFlight.clear()
}

function setCookies(host: string, headers: Headers) {
  const cookies = cookiesByHost.get(host) || new Map<string, string>()
  const cookieHeaders = headers as Headers & { getSetCookie?: () => string[] }
  const values = cookieHeaders.getSetCookie?.() || []
  const combined = headers.get("set-cookie")
  if (!values.length && combined) {
    values.push(...combined.split(/,(?=\s*[^;,\s=]+=[^;,]*)/))
  }
  for (const item of values) {
    const pair = item.split(";", 1)[0]?.trim() || ""
    const equalsAt = pair.indexOf("=")
    if (equalsAt <= 0) continue
    const name = pair.slice(0, equalsAt).trim()
    const value = pair.slice(equalsAt + 1)
    if (/max-age\s*=\s*0/i.test(item)) {
      cookies.delete(name)
    } else {
      cookies.set(name, value)
    }
  }
  if (cookies.size) cookiesByHost.set(host, cookies)
  else cookiesByHost.delete(host)
}

async function ozonDeliveryFetch(input: DeliveryFetchInput) {
  let current = new URL(input.url)
  const origin = current.origin
  const headers: Record<string, string> = { ...(input.headers || {}) }
  for (let redirect = 0; redirect <= 6; redirect++) {
    const cookies = cookiesByHost.get(current.hostname)
    if (cookies?.size) {
      headers.Cookie = [...cookies.entries()]
        .map(([name, value]) => `${name}=${value}`)
        .join("; ")
    }
    const response = await fetch(current, {
      method: input.method,
      headers,
      body: input.body,
      redirect: "manual",
    })
    setCookies(current.hostname, response.headers)
    if (![301, 302, 303, 307, 308].includes(response.status)) return response
    const location = response.headers.get("location")
    if (!location || redirect === 6) {
      throw new MedusaError(
        MedusaError.Types.UNEXPECTED_STATE,
        "Ozon Delivery API: redirect limit exceeded"
      )
    }
    const next = new URL(location, current)
    if (next.protocol !== "https:" || next.origin !== origin) {
      throw new MedusaError(
        MedusaError.Types.UNEXPECTED_STATE,
        "Ozon Delivery API: rejected redirect host"
      )
    }
    if (next.hostname !== current.hostname) {
      const nextCookies = cookiesByHost.get(next.hostname)
      if (nextCookies?.size) {
        headers.Cookie = [...nextCookies.entries()]
          .map(([name, value]) => `${name}=${value}`)
          .join("; ")
      } else {
        delete headers.Cookie
      }
    }
    current = next
  }
  throw new MedusaError(
    MedusaError.Types.UNEXPECTED_STATE,
    "Ozon Delivery API: redirect limit exceeded"
  )
}

function errorCode(body: string) {
  try {
    const parsed = record(JSON.parse(body))
    const error = {
      ...parsedDiagnosticObject(parsed.error),
      ...record(parsed.error),
    }
    return safeDeliveryDiagnosticCode(valueText(error.code, parsed.code))
  } catch {
    return "request_failed"
  }
}

function safeDeliveryDiagnosticCode(value: string) {
  return /^[A-Z0-9_.-]{1,100}$/i.test(value) ? value : "request_failed"
}

function safeDeliveryDiagnosticText(value: unknown) {
  return String(value ?? "")
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[redacted]")
    .replace(
      /(^|[^\p{L}\p{N}_])((?:full[_ -]?address|shipping[_ -]?address|pickup[_ -]?address|address|адрес(?:а|у|ом)?(?:\s+доставки)?|улица|ул\.?|проспект|пр-т|переулок|пер\.?|шоссе|бульвар|набережная|street|st\.?|avenue|ave\.?|road|rd\.?|city|город|г\.?))\s*(?::|=|is\b|was\b|for\b)?\s*["']?[^;\n}]+/giu,
      "$1$2=[redacted]"
    )
    .replace(
      /(^|[^\p{L}\p{N}_])((?:coordinates?|latitude|longitude|lat|lon|широта|долгота|координаты))\s*[:=]\s*[-+]?\d+(?:\.\d+)?(?:\s*[,/]\s*[-+]?\d+(?:\.\d+)?)?/giu,
      "$1$2=[redacted]"
    )
    .replace(/-?\d{1,2}\.\d{2,}\s*,\s*-?\d{1,3}\.\d{2,}/g, "[coordinates redacted]")
    .replace(/\+?\d[\d\s().-]{7,}\d/g, "[redacted]")
    .replace(
      /\b(client[_-]?secret|api[_-]?key|access[_-]?token|refresh[_-]?token|authorization|password|secret|token)\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s,}]+)/gi,
      "$1=[redacted]"
    )
    .replace(/\bbearer\s+[^\s,}]+/gi, "Bearer [redacted]")
    .slice(0, 500)
}

function parsedDiagnosticObject(value: unknown) {
  if (typeof value !== "string") return record(value)
  try {
    return record(JSON.parse(value))
  } catch {
    return {}
  }
}

function deliveryApiRequestErrorDiagnostics(
  path: string,
  status: number,
  request: Record<string, unknown>,
  responseText: string
) {
  let parsed: unknown = null
  try {
    parsed = JSON.parse(responseText)
  } catch {
    // Keep a short, redacted preview below for non-JSON Ozon errors.
  }
  const response = record(parsed)
  const error = {
    ...parsedDiagnosticObject(response.error),
    ...record(response.error),
  }
  const nestedErrors = Array.isArray(response.errors)
    ? response.errors.map(record)
    : []
  const requestSummary: Record<string, unknown> = {
    fields: Object.keys(request).sort(),
  }
  const arrayCounts = Object.fromEntries(
    Object.entries(request)
      .filter(([, value]) => Array.isArray(value))
      .map(([key, value]) => [key, (value as unknown[]).length])
  )
  if (Object.keys(arrayCounts).length) {
    requestSummary.array_counts = arrayCounts
  }
  if (Array.isArray(request.delivery_point_ids)) {
    requestSummary.delivery_point_ids_count = request.delivery_point_ids.length
    requestSummary.delivery_point_ids_sample = request.delivery_point_ids
      .slice(0, 5)
      .map((value) => String(value))
  }
  const pagination = record(request.pagination)
  if (Object.keys(pagination).length) {
    requestSummary.pagination = {
      limit: positiveInt(pagination.limit),
      cursor_present: Boolean(valueText(pagination.cursor)),
    }
  }

  const nestedCode = nestedErrors
    .map((item) => valueText(item.code))
    .filter(Boolean)
  const nestedMessage = nestedErrors
    .map((item) => valueText(item.message, item.detail))
    .filter(Boolean)
  const errorMessage = safeDeliveryDiagnosticText(
    valueText(
      error.message,
      response.message,
      response.error_description,
      response.detail,
      typeof response.error === "string" ? response.error : "",
      ...nestedMessage
    )
  )
  const responseFields = Object.keys(response).slice(0, 20)
  const responseSummary: Record<string, unknown> = {
    error_code: safeDeliveryDiagnosticCode(
      valueText(error.code, response.code, ...nestedCode)
    ),
    error_message: errorMessage || null,
    fields: responseFields,
    body_chars: responseText.length,
  }
  if (!responseFields.length && responseText.trim()) {
    responseSummary.body_preview = safeDeliveryDiagnosticText(responseText)
  }

  return {
    endpoint: path,
    http_status: status,
    request: requestSummary,
    response: responseSummary,
  }
}

async function fetchAccessToken(config: Pick<OzonDeliveryApiConfig, "clientId" | "clientSecret">) {
  const key = `${config.clientId}:${config.clientSecret}:${OZON_DELIVERY_SCOPES.join(",")}`
  if (tokenCache?.key === key && tokenCache.expiresAt > Date.now() + 30_000) {
    return tokenCache.token
  }
  const response = await ozonDeliveryFetch({
    url: OZON_DELIVERY_TOKEN_URL,
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: "client_credentials",
      scope: OZON_DELIVERY_SCOPES,
    }),
  })
  const text = await response.text()
  if (!response.ok) {
    throw new MedusaError(
      MedusaError.Types.UNEXPECTED_STATE,
      `Ozon Delivery OAuth HTTP ${response.status}: ${errorCode(text)}`
    )
  }
  const payload = record(JSON.parse(text || "{}"))
  const accessToken = valueText(payload.access_token, payload.accessToken)
  if (!accessToken) {
    throw new MedusaError(
      MedusaError.Types.UNEXPECTED_STATE,
      "Ozon Delivery API не вернул токен доступа"
    )
  }
  const expiresIn = Number(payload.expires_in)
  tokenCache = {
    key,
    token: accessToken,
    expiresAt:
      Date.now() +
      (Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn * 1000 : 50 * 60 * 1000),
  }
  return accessToken
}

async function deliveryPostRaw(
  credentials: Pick<OzonDeliveryApiConfig, "clientId" | "clientSecret">,
  path: string,
  body: Record<string, unknown>,
  headers: Record<string, string> = {}
) {
  const accessToken = await fetchAccessToken(credentials)
  const response = await ozonDeliveryFetch({
    url: `${OZON_DELIVERY_API_URL}${path}`,
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  })
  const buffer = Buffer.from(await response.arrayBuffer())
  if (!response.ok) {
    const responseText = buffer.toString("utf8")
    const error = new MedusaError(
      MedusaError.Types.UNEXPECTED_STATE,
      `Ozon Delivery API HTTP ${response.status}: ${errorCode(responseText)}`
    ) as MedusaError & { ozonDeliveryApiDiagnostics?: unknown }
    error.ozonDeliveryApiDiagnostics = deliveryApiRequestErrorDiagnostics(
      path,
      response.status,
      body,
      responseText
    )
    throw error
  }
  return {
    buffer,
    contentType: response.headers.get("content-type") || "application/json",
  }
}

async function deliveryPostJson(
  credentials: Pick<OzonDeliveryApiConfig, "clientId" | "clientSecret">,
  path: string,
  body: Record<string, unknown>,
  headers: Record<string, string> = {}
) {
  const raw = await deliveryPostRaw(credentials, path, body, headers)
  try {
    return record(raw.buffer.length ? JSON.parse(raw.buffer.toString("utf8")) : {})
  } catch {
    throw new MedusaError(
      MedusaError.Types.UNEXPECTED_STATE,
      "Ozon Delivery API вернул некорректный ответ"
    )
  }
}

function apiResult(raw: unknown) {
  const response = record(raw)
  return Object.prototype.hasOwnProperty.call(response, "result")
    ? record(response.result)
    : response
}

function moneyAmount(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
}

function cutoffAt() {
  return new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().replace(/\.\d{3}Z$/, "Z")
}

function postingDimensions(config: OzonDeliveryApiConfig) {
  return {
    weight_g: config.parcel.weightG,
    length_mm: config.parcel.lengthMm,
    width_mm: config.parcel.widthMm,
    height_mm: config.parcel.heightMm,
  }
}

function declaredValue(amount: number) {
  return { amount: Math.max(0, Number(amount) || 0).toFixed(2), currency_code: "RUB" }
}

function requirePointId(value: unknown) {
  const pointId = positiveInt(value)
  if (!pointId) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Пункт выдачи не поддерживается Ozon Delivery API"
    )
  }
  return pointId
}

function deliveryApiPoint(row: unknown): OzonDeliveryApiPoint | null {
  const point = record(row)
  const id = positiveInt(point.delivery_point_id)
  const coordinates = record(point.coordinates)
  const lat = Number(coordinates.latitude)
  const lon = Number(coordinates.longitude)
  if (!id || point.is_active === false || !Number.isFinite(lat) || !Number.isFinite(lon)) {
    return null
  }
  const address = valueText(point.full_address)
  const city = address.match(/(?:г\.|город)\s*([^,]+)/i)?.[1]?.trim()
  return {
    id: String(id),
    name: valueText(point.name, point.delivery_point_number) || `Пункт ${id}`,
    address,
    lat,
    lon,
    city,
  }
}

function hasShipmentMethod(raw: unknown, methodId: number) {
  const values = Array.isArray(raw) ? raw : [raw]
  return values.some((value) => Number(value) === methodId)
}

async function deliveryApiPointList(
  config: OzonDeliveryApiConfig,
  pointIds: number[]
) {
  const response = await deliveryPostJson(config, "/v1/delivery-point/info", {
    delivery_point_ids: pointIds,
  })
  const result = apiResult(response)
  return Array.isArray(result.delivery_points) ? result.delivery_points : []
}

async function fetchOzonDeliveryApiPoints(config: OzonDeliveryApiConfig) {
  const candidateIds: number[] = []
  let cursor = ""
  for (let page = 0; page < 200; page++) {
    const request: Record<string, unknown> = {
      pagination: { limit: 100, ...(cursor ? { cursor } : {}) },
    }
    const response = await deliveryPostJson(config, "/v1/delivery-point/list", request)
    const result = apiResult(response)
    const rows = Array.isArray(result.delivery_points) ? result.delivery_points : []
    for (const row of rows) {
      const point = record(row)
      const id = positiveInt(point.delivery_point_id)
      if (id && hasShipmentMethod(point.shipment_method_ids, config.shipmentMethodId)) {
        candidateIds.push(id)
      }
    }
    const nextCursor = valueText(result.next_cursor)
    if (!nextCursor || nextCursor === cursor || !rows.length) break
    cursor = nextCursor
  }

  const uniqueIds = [...new Set(candidateIds)]
  const pages: number[][] = []
  for (
    let index = 0;
    index < uniqueIds.length;
    index += DELIVERY_POINT_INFO_BATCH_SIZE
  ) {
    pages.push(
      uniqueIds.slice(index, index + DELIVERY_POINT_INFO_BATCH_SIZE)
    )
  }
  const details: unknown[] = []
  for (let index = 0; index < pages.length; index += 3) {
    const batch = await Promise.all(
      pages.slice(index, index + 3).map((ids) => deliveryApiPointList(config, ids))
    )
    details.push(...batch.flat())
  }
  return details.map(deliveryApiPoint).filter((point): point is OzonDeliveryApiPoint => Boolean(point))
}

export async function listOzonDeliveryApiPoints(config: OzonDeliveryApiConfig) {
  const key = `${config.clientId}:${config.shipmentMethodId}`
  const cached = deliveryPointsCache.get(key)
  if (cached && cached.expiresAt > Date.now()) return cached.points
  let pending = deliveryPointsInFlight.get(key)
  if (!pending) {
    pending = fetchOzonDeliveryApiPoints(config)
    deliveryPointsInFlight.set(key, pending)
    pending.then(
      () => deliveryPointsInFlight.delete(key),
      () => deliveryPointsInFlight.delete(key)
    )
  }
  const points = await pending
  deliveryPointsCache.set(key, {
    points,
    expiresAt: Date.now() + 30 * 60 * 1000,
  })
  return points
}

export async function listOzonDeliveryApiShipmentMethods(
  credentials: OzonDeliveryApiCredentials
) {
  const methods = new Map<number, OzonDeliveryApiShipmentMethod>()
  let cursor = ""
  for (let page = 0; page < 100; page++) {
    const response = await deliveryPostJson(
      credentials,
      "/v1/shipment-method/search",
      {
        filters: { statuses: ["active"] },
        pagination: { limit: 100, ...(cursor ? { cursor } : {}) },
      }
    )
    const result = apiResult(response)
    const rows = Array.isArray(result.shipment_methods)
      ? result.shipment_methods
      : []
    for (const value of rows) {
      const row = record(value)
      const id = positiveInt(row.shipment_method_id)
      if (!id) continue
      const types = record(row.type)
      const type = Object.keys(types).find((key) => Boolean(types[key])) || null
      const typeInfo = record(type ? types[type] : null)
      const error = record(row.error)
      methods.set(id, {
        shipment_method_id: id,
        name: valueText(row.name) || `Метод ${id}`,
        status: valueText(row.status) || null,
        type,
        dropoff_point_id: positiveInt(typeInfo.dropoff_point_id),
        full_address: valueText(row.full_address) || null,
        error_code: valueText(error.code) || null,
      })
    }
    const nextCursor = valueText(result.next_cursor)
    if (!nextCursor || nextCursor === cursor || !rows.length) break
    cursor = nextCursor
  }
  return [...methods.values()]
}

function normalizePointAddress(value: unknown) {
  return String(value || "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^\p{L}\p{N}]+/gu, "")
}

function pointDistanceMeters(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number }
) {
  const radians = Math.PI / 180
  const lat1 = a.lat * radians
  const lat2 = b.lat * radians
  const deltaLat = (b.lat - a.lat) * radians
  const deltaLon = (b.lon - a.lon) * radians
  const haversine =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))
}

export async function matchOzonDeliveryApiPointWithDiagnostics(
  input: OzonDeliveryApiPointMatchInput
) {
  const lat = Number(input.lat)
  const lon = Number(input.lon)
  const address = normalizePointAddress(input.address)
  const hasLatitude = Number.isFinite(lat)
  const hasLongitude = Number.isFinite(lon)
  const hasUsableCoordinates =
    hasLatitude && hasLongitude && (lat !== 0 || lon !== 0)
  const sourceLocation = {
    has_text: Boolean(address),
    has_latitude: hasLatitude,
    has_longitude: hasLongitude,
  }
  const emptyDiagnostics = (
    matchStatus: OzonDeliveryApiPointMatchDiagnostics["match_status"]
  ): OzonDeliveryApiPointMatchDiagnostics => ({
    match_status: matchStatus,
    shipment_method_id: input.config.shipmentMethodId,
    source_location: sourceLocation,
    delivery_api_point_count: 0,
    nearby_point_count: 0,
    location_text_match_count: 0,
    nearest_points: [],
  })

  if (!hasUsableCoordinates) {
    return {
      point: null,
      diagnostics: emptyDiagnostics(
        hasLatitude && hasLongitude
          ? "invalid_coordinates"
          : "missing_coordinates"
      ),
    }
  }

  const points = await listOzonDeliveryApiPoints(input.config)
  const candidates = points
    .map((point) => ({
      point,
      distance: pointDistanceMeters({ lat, lon }, point),
      address: normalizePointAddress(point.address),
    }))
    .sort((a, b) => a.distance - b.distance)
  const nearby = candidates.filter((candidate) => candidate.distance <= 250)
  const matchesLocationText = (candidate: (typeof candidates)[number]) =>
    address.length >= 12 &&
    candidate.address.length >= 12 &&
    (candidate.address === address ||
      candidate.address.includes(address) ||
      address.includes(candidate.address))
  const addressMatches = nearby.filter(matchesLocationText)
  let point: OzonDeliveryApiPoint | null = null
  let matchStatus: OzonDeliveryApiPointMatchDiagnostics["match_status"] =
    "ambiguous_or_location_mismatch"

  if (addressMatches.length === 1) {
    point = addressMatches[0].point
    matchStatus = "matched_by_location_text"
  } else if (addressMatches.length > 1) {
    const [closest, next] = addressMatches
    if (next.distance - closest.distance >= 25) {
      point = closest.point
      matchStatus = "matched_by_location_text"
    }
  }

  if (!point && nearby.length) {
    const [closest, next] = nearby
    if (
      closest.distance <= 12 &&
      (!next || next.distance - closest.distance >= 25)
    ) {
      point = closest.point
      matchStatus = "matched_by_coordinates"
    }
  }

  if (!points.length) matchStatus = "no_points_for_method"
  else if (!nearby.length) matchStatus = "no_points_within_250m"

  return {
    point,
    diagnostics: {
      match_status: matchStatus,
      shipment_method_id: input.config.shipmentMethodId,
      source_location: sourceLocation,
      delivery_api_point_count: points.length,
      nearby_point_count: nearby.length,
      location_text_match_count: addressMatches.length,
      nearest_points: candidates.slice(0, 5).map((candidate) => ({
        delivery_point_id: candidate.point.id,
        distance_m: Math.round(candidate.distance),
        within_250m: candidate.distance <= 250,
        location_text_matches: matchesLocationText(candidate),
      })),
    } satisfies OzonDeliveryApiPointMatchDiagnostics,
  }
}

export async function matchOzonDeliveryApiPoint(
  input: OzonDeliveryApiPointMatchInput
) {
  const result = await matchOzonDeliveryApiPointWithDiagnostics(input)
  return result.point
}

export async function getOzonDeliveryApiPoint(
  config: OzonDeliveryApiConfig,
  pointId: string
) {
  const id = requirePointId(pointId)
  const response = await deliveryPostJson(config, "/v1/delivery-point/info", {
    delivery_point_ids: [id],
  })
  const result = apiResult(response)
  const rows = Array.isArray(result.delivery_points) ? result.delivery_points : []
  const point = rows.map(deliveryApiPoint).find((row) => row?.id === String(id))
  if (!point) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Пункт выдачи не найден в Ozon Delivery API"
    )
  }
  return point
}

async function checkoutOzonDeliveryApi(input: {
  config: OzonDeliveryApiConfig
  pointId: string
  phone: string
  declaredValue: number
}) {
  if (!/^\+\d{10,15}$/.test(String(input.phone || "").trim())) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Проверьте телефон получателя"
    )
  }
  await getOzonDeliveryApiPoint(input.config, input.pointId)
  const response = await deliveryPostJson(
    input.config,
    "/v1/order/checkout",
    {
      recipient: { phone_number: input.phone },
      postings: [
        {
          request_id: 1,
          shipment_method_id: input.config.shipmentMethodId,
          cutoff_at: cutoffAt(),
          declared_value: declaredValue(input.declaredValue),
          dimensions: postingDimensions(input.config),
        },
      ],
      delivery: {
        delivery_point: { delivery_point_id: requirePointId(input.pointId) },
      },
    }
  )
  const result = apiResult(response)
  const rows = Array.isArray(result.results) ? result.results : []
  const first = record(rows[0])
  const error = record(first.error)
  if (error.code) {
    throw new MedusaError(
      MedusaError.Types.UNEXPECTED_STATE,
      `Ozon Delivery checkout: ${valueText(error.code)}`
    )
  }
  const posting = record(first.posting)
  if (!Object.keys(posting).length) {
    throw new MedusaError(
      MedusaError.Types.UNEXPECTED_STATE,
      "Ozon Delivery checkout не вернул параметры отправления"
    )
  }
  return {
    cutoffAt: valueText(posting.cutoff_at) || cutoffAt(),
    amount: moneyAmount(record(posting.estimated_delivery_cost).amount),
  }
}

export async function quoteOzonDeliveryApi(input: {
  config: OzonDeliveryApiConfig
  pointId: string
  phone: string
  declaredValue: number
}) {
  const quote = await checkoutOzonDeliveryApi(input)
  return quote.amount != null && quote.amount > 0 ? quote.amount : null
}

export async function createOzonDeliveryApiOrder(input: {
  config: OzonDeliveryApiConfig
  idempotencyKey: string
  orderExternalId: string
  postingExternalId: string
  buyer: { name: string; phone: string }
  pointId: string
  description: string
  declaredValue: number
}) {
  const idempotencyKey = String(input.idempotencyKey || "").trim()
  if (!idempotencyKey) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Не удалось подготовить ключ безопасного повтора отправления"
    )
  }
  const phone = String(input.buyer.phone || "").trim()
  if (!/^\+\d{10,15}$/.test(phone)) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Проверьте телефон получателя"
    )
  }
  const checkout = await checkoutOzonDeliveryApi({
    config: input.config,
    pointId: input.pointId,
    phone,
    declaredValue: input.declaredValue,
  })
  const response = await deliveryPostJson(
    input.config,
    "/v1/order/create",
    {
      order_external_id: input.orderExternalId,
      recipient: {
        phone_number: phone,
        full_name: input.buyer.name,
      },
      delivery: {
        delivery_point: { delivery_point_id: requirePointId(input.pointId) },
      },
      postings: [
        {
          request_id: 1,
          posting_external_id: input.postingExternalId,
          shipment_method_id: input.config.shipmentMethodId,
          description: input.description.slice(0, 500),
          declared_value: declaredValue(input.declaredValue),
          cutoff_at: checkout.cutoffAt,
          dimensions: postingDimensions(input.config),
        },
      ],
    },
    { "Idempotency-Key": idempotencyKey }
  )
  const result = apiResult(response)
  const postings = Array.isArray(result.postings) ? result.postings : []
  const firstPosting = record(postings[0])
  const orderNumber = valueText(result.order_number, result.orderNumber)
  const postingNumber = valueText(firstPosting.posting_number, firstPosting.postingNumber)
  if (!orderNumber || !postingNumber) {
    throw new MedusaError(
      MedusaError.Types.UNEXPECTED_STATE,
      "Ozon Delivery API создал заказ без номера отправления"
    )
  }
  return {
    orderNumber,
    postingNumber,
    trackingUrl: null,
    status: "created",
    raw: response,
  }
}

export async function getOzonDeliveryApiPosting(
  config: OzonDeliveryApiConfig,
  postingNumber: string
): Promise<OzonDeliveryPosting> {
  const number = String(postingNumber || "").trim()
  if (!number) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Нет номера отправления Ozon"
    )
  }
  const response = await deliveryPostJson(config, "/v1/posting/info", {
    posting_numbers: [number],
  })
  const result = apiResult(response)
  const postings = Array.isArray(result.postings) ? result.postings : []
  const posting = record(postings[0])
  if (!posting.posting_number) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      "Ozon Delivery API: posting_not_found"
    )
  }
  return {
    postingNumber: valueText(posting.posting_number),
    orderNumber: valueText(posting.order_number) || null,
    status: valueText(posting.status) || null,
  }
}

export async function approveOzonDeliveryApiPosting(
  config: OzonDeliveryApiConfig,
  postingNumber: string
) {
  await deliveryPostJson(config, "/v1/posting/approve", {
    posting_number: postingNumber,
  })
}

export async function cancelOzonDeliveryApiPosting(
  config: OzonDeliveryApiConfig,
  postingNumber: string
) {
  await deliveryPostJson(config, "/v1/posting/cancel", {
    posting_number: postingNumber,
  })
}

export async function getOzonDeliveryApiLabel(
  config: OzonDeliveryApiConfig,
  postingNumber: string
): Promise<OzonDeliveryLabel> {
  const raw = await deliveryPostRaw(config, "/v1/posting/label", {
    posting_number: postingNumber,
  })
  let bytes = raw.buffer
  let contentType = raw.contentType
  let fileName = `ozon-${postingNumber}.pdf`
  if (/json/i.test(contentType)) {
    try {
      const json = record(JSON.parse(raw.buffer.toString("utf8")))
      const result = apiResult(json)
      const content = valueText(result.file_content, result.content)
      if (content) {
        bytes = content.startsWith("%PDF")
          ? Buffer.from(content, "utf8")
          : Buffer.from(content, "base64")
      }
      contentType = valueText(result.content_type, result.contentType) || "application/pdf"
      fileName = valueText(result.file_name, result.fileName) || fileName
    } catch {
      // A successful binary label may be served without an application/pdf header.
    }
  }
  if (!bytes.length) {
    throw new MedusaError(
      MedusaError.Types.UNEXPECTED_STATE,
      "Ozon Delivery API вернул пустую этикетку"
    )
  }
  return { bytes, contentType: /pdf/i.test(contentType) ? "application/pdf" : contentType, fileName }
}
