import { MedusaError } from "@medusajs/framework/utils"
import { publicBackendUrl } from "./public-url"

function ozonHttpError(status: number, text: string) {
  return new MedusaError(
    MedusaError.Types.UNEXPECTED_STATE,
    `Ozon HTTP ${status}: ${text.slice(0, 240)}`
  )
}

export type OzonPoint = {
  id: string
  name: string
  address: string
  lat: number
  lon: number
  schedule?: string
  city?: string
}

export type OzonMapCluster = {
  count: number
  lat: number
  lon: number
  south?: number
  west?: number
  north?: number
  east?: number
}

export type OzonCreds = {
  clientId: string
  clientSecret: string
  refreshToken: string
  fromPlaceId: string
  accessToken: string
}

export function ozonCredsFromRow(
  row: Record<string, unknown> | null | undefined
): OzonCreds | null {
  if (!row) return null
  const clientId = String(row.ozon_client_id || "").trim()
  const oauth = String(row.ozon_oauth_token || "").trim()
  const refreshToken = String(row.ozon_refresh_token || "").trim()
  const accessToken = isOzonAccessToken(oauth) ? oauth : ""
  const clientSecret = accessToken ? "" : oauth
  if (!accessToken && !refreshToken && (!clientId || !clientSecret)) return null
  return {
    clientId,
    clientSecret,
    refreshToken,
    fromPlaceId: String(row.ozon_from_place_id || "").trim(),
    accessToken,
  }
}

export function isOzonAccessToken(value: string) {
  return /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(
    String(value || "").trim()
  )
}

export function sellerAuthHeaders(creds: OzonCreds): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  }
  if (isOzonAccessToken(creds.accessToken)) {
    headers.Authorization = `Bearer ${creds.accessToken}`
  }
  return headers
}

export function sellerAuthHeadersFor(creds: OzonCreds, _path?: string) {
  return sellerAuthHeaders(creds)
}

const OZON_OAUTH_TOKEN_URL = "https://xapi.ozon.ru/oauth/token"
const OZON_OAUTH_AUTHORIZE_URL =
  "https://seller.ozon.ru/app/appstore/oauth/authorize"
export const OZON_OAUTH_SCOPES = [
  "seller-api.ozon-logistics",
  "seller-api.product",
  "seller-api.posting-fbs",
  "seller-api.posting-fbo",
  "seller-api.warehouse",
  "seller-api.returns",
].join(" ")
export const OZON_OAUTH_CALLBACK_PATH = "/hooks/ozon/oauth"

type OzonAppTokenCache = {
  key: string
  token: string
  expiresAt: number
}

let ozonAppTokenCache: OzonAppTokenCache | null = null

type OzonTokenPersist = (tokens: {
  accessToken: string
  refreshToken: string
}) => void | Promise<void>

let ozonTokenPersist: OzonTokenPersist | null = null

export function resetOzonAppTokenCache() {
  ozonAppTokenCache = null
}

export function setOzonTokenPersist(fn: OzonTokenPersist | null) {
  ozonTokenPersist = fn
}

async function persistOzonTokens(tokens: {
  accessToken: string
  refreshToken: string
}) {
  if (!ozonTokenPersist) return
  await ozonTokenPersist(tokens)
}

function tokenExpiryMs(expiresIn: unknown) {
  const value = Number(expiresIn)
  if (!Number.isFinite(value) || value <= 0) {
    return Date.now() + 50 * 60 * 1000
  }
  if (value > 1e12) return value
  if (value > 1e9) return value * 1000
  return Date.now() + value * 1000
}

export function ozonOAuthRedirectUri(
  env: NodeJS.ProcessEnv = process.env
) {
  return `${publicBackendUrl(undefined, env).replace(/\/$/, "")}${OZON_OAUTH_CALLBACK_PATH}`
}

export function ozonAuthorizeUrl(input: {
  clientId: string
  redirectUri: string
  state: string
  scope?: string
}) {
  const params = new URLSearchParams({
    response_type: "code",
    access_type: "offline",
    client_id: String(input.clientId || "").trim(),
    redirect_uri: String(input.redirectUri || "").trim(),
    scope: String(input.scope || OZON_OAUTH_SCOPES).trim(),
    state: String(input.state || "").trim(),
    prompt: "select_company",
  })
  return `${OZON_OAUTH_AUTHORIZE_URL}?${params.toString()}`
}

async function postOzonOauth(body: Record<string, string>) {
  const response = await fetch(OZON_OAUTH_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  })
  const text = await response.text()
  let json: Record<string, unknown> = {}
  try {
    json = text ? (JSON.parse(text) as Record<string, unknown>) : {}
  } catch {
    json = { raw: text }
  }
  if (!response.ok) {
    throw ozonHttpError(response.status, text)
  }
  const accessToken = String(json.access_token || json.accessToken || "").trim()
  const refreshToken = String(json.refresh_token || json.refreshToken || "").trim()
  if (!accessToken) {
    throw new MedusaError(
      MedusaError.Types.UNEXPECTED_STATE,
      "Ozon не вернул access token для кабинета продавца"
    )
  }
  return {
    accessToken,
    refreshToken,
    expiresAt: tokenExpiryMs(json.expires_in ?? json.expiresIn),
  }
}

export async function exchangeOzonAuthCode(input: {
  clientId: string
  clientSecret: string
  code: string
  redirectUri: string
}) {
  const clientId = String(input.clientId || "").trim()
  const clientSecret = String(input.clientSecret || "").trim()
  const code = String(input.code || "").trim()
  const redirectUri = String(input.redirectUri || "").trim()
  if (!clientId || !clientSecret || !code || !redirectUri) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Нужны Client ID, Client Secret и код доступа кабинета Ozon"
    )
  }
  const tokens = await postOzonOauth({
    grant_type: "authorization_code",
    client_id: clientId,
    client_secret: clientSecret,
    code,
    redirect_uri: redirectUri,
  })
  ozonAppTokenCache = {
    key: `${clientId}:${clientSecret}:${tokens.refreshToken}`,
    token: tokens.accessToken,
    expiresAt: tokens.expiresAt,
  }
  return {
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
  }
}

export async function fetchOzonAppToken(input: {
  clientId: string
  clientSecret: string
  refreshToken?: string
}) {
  const clientId = String(input.clientId || "").trim()
  const clientSecret = String(input.clientSecret || "").trim()
  const refreshToken = String(input.refreshToken || "").trim()
  if (!clientId || !clientSecret) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Нужны Client ID и Client Secret частного приложения Ozon"
    )
  }
  if (!refreshToken) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Подключите кабинет продавца Ozon в настройках магазина."
    )
  }
  const key = `${clientId}:${clientSecret}:${refreshToken}`
  if (
    ozonAppTokenCache &&
    ozonAppTokenCache.key === key &&
    ozonAppTokenCache.expiresAt > Date.now() + 30_000
  ) {
    return ozonAppTokenCache.token
  }
  const tokens = await postOzonOauth({
    grant_type: "refresh_token",
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
  }).catch(async (error) => {
    const raw = error instanceof Error ? error.message : String(error || "")
    if (/invalid_refresh_token/i.test(raw)) {
      resetOzonAppTokenCache()
      await persistOzonTokens({ accessToken: "", refreshToken: "" })
    }
    throw error
  })
  const nextRefresh = tokens.refreshToken || refreshToken
  ozonAppTokenCache = {
    key: `${clientId}:${clientSecret}:${nextRefresh}`,
    token: tokens.accessToken,
    expiresAt: tokens.expiresAt,
  }
  if (tokens.refreshToken && tokens.refreshToken !== refreshToken) {
    try {
      await persistOzonTokens({
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
      })
    } catch {
      // Keep the live access token even if the new refresh token was not saved.
    }
  }
  return tokens.accessToken
}

export async function resolveSellerAccessToken(creds: OzonCreds) {
  if (isOzonAccessToken(creds.accessToken)) return creds.accessToken
  return fetchOzonAppToken({
    clientId: creds.clientId,
    clientSecret: creds.clientSecret,
    refreshToken: creds.refreshToken,
  })
}

export function normalizeOzonPhone(phone: string) {
  const digits = String(phone || "").replace(/\D/g, "")
  if (!digits) return ""
  if (digits.length === 11 && digits.startsWith("8")) return `7${digits.slice(1)}`
  if (digits.length === 10) return `7${digits}`
  return digits
}

export function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function firstNumber(...values: unknown[]) {
  for (const value of values) {
    if (value == null || value === "") continue
    if (typeof value === "object") continue
    const numeric = Number(value)
    if (Number.isFinite(numeric)) return numeric
  }
  return null
}

function coordLat(coord: unknown) {
  const rec = asRecord(coord)
  return firstNumber(rec?.lat, rec?.latitude, rec?.coord_lat)
}

function coordLon(coord: unknown) {
  const rec = asRecord(coord)
  return firstNumber(
    rec?.lon,
    rec?.lng,
    rec?.longitude,
    rec?.coord_long,
    rec?.long
  )
}

export function firstText(...values: unknown[]) {
  for (const value of values) {
    const text = String(value ?? "").trim()
    if (text) return text
  }
  return ""
}

function clusterViewport(rec: Record<string, unknown>) {
  const view = asRecord(rec.viewport)
  if (!view) return {}
  const bottom = asRecord(view.left_bottom) || asRecord(view.south_west)
  const top = asRecord(view.right_top) || asRecord(view.north_east)
  const south = firstNumber(bottom?.lat, bottom?.latitude, view.south)
  const west = firstNumber(bottom?.long, bottom?.lon, bottom?.longitude, view.west)
  const north = firstNumber(top?.lat, top?.latitude, view.north)
  const east = firstNumber(top?.long, top?.lon, top?.longitude, view.east)
  if (
    south == null ||
    west == null ||
    north == null ||
    east == null ||
    north <= south ||
    east <= west
  ) {
    return {}
  }
  return { south, west, north, east }
}

export function parseOzonClusters(raw: unknown): OzonMapCluster[] {
  const out: OzonMapCluster[] = []
  const stack: unknown[] = [raw]
  while (stack.length) {
    const cur = stack.pop()
    if (!cur) continue
    if (Array.isArray(cur)) {
      for (const item of cur) stack.push(item)
      continue
    }
    const rec = asRecord(cur)
    if (!rec) continue
    const count = firstNumber(rec.points_count, rec.count)
    const coord = rec.coordinate || rec.coordinates || rec.location
    const lat = firstNumber(rec.lat, rec.latitude, coordLat(coord))
    const lon = firstNumber(
      rec.lon,
      rec.lng,
      rec.longitude,
      rec.long,
      coordLon(coord)
    )
    const ids = Array.isArray(rec.map_point_ids) ? rec.map_point_ids : []
    const isBucket =
      count != null &&
      count > 1 &&
      rec.map_point_id == null &&
      rec.point_id == null &&
      lat != null &&
      lon != null
    if (isBucket) {
      out.push({
        count,
        lat,
        lon,
        ...clusterViewport(rec),
      })
      continue
    }
    if (count != null && count <= 1 && ids.length <= 1) {
      for (const value of Object.values(rec)) {
        if (value && typeof value === "object") stack.push(value)
      }
      continue
    }
    if (Array.isArray(rec.clusters)) stack.push(rec.clusters)
    else {
      for (const value of Object.values(rec)) {
        if (value && typeof value === "object") stack.push(value)
      }
    }
  }
  return out
}

export const PVZ_PIN_ZOOM = 15

export function resolveOzonMapLayers(
  points: OzonPoint[],
  clusters: OzonMapCluster[],
  zoom: number
) {
  const z = Number(zoom)
  if (Number.isFinite(z) && z >= PVZ_PIN_ZOOM && points.length) {
    return { points, clusters: [] as OzonMapCluster[] }
  }
  return { points, clusters }
}

export function clusterOzonPoints(
  points: OzonPoint[],
  zoom: number,
  cell?: number
) {
  const z = Number.isFinite(zoom) ? zoom : 12
  if (z >= PVZ_PIN_ZOOM || points.length < 2) {
    return { points, clusters: [] as OzonMapCluster[] }
  }
  const size = cell ?? Math.max(0.003, 0.42 / 2 ** Math.max(0, z - 6))
  const buckets = new Map<string, OzonPoint[]>()
  for (const point of points) {
    const key = `${Math.round(point.lat / size)}:${Math.round(point.lon / size)}`
    const list = buckets.get(key)
    if (list) list.push(point)
    else buckets.set(key, [point])
  }
  const singles: OzonPoint[] = []
  const clusters: OzonMapCluster[] = []
  for (const group of buckets.values()) {
    if (group.length === 1) {
      singles.push(group[0])
      continue
    }
    const lat = group.reduce((sum, item) => sum + item.lat, 0) / group.length
    const lon = group.reduce((sum, item) => sum + item.lon, 0) / group.length
    clusters.push({
      count: group.length,
      lat,
      lon,
      south: Math.min(...group.map((item) => item.lat)),
      north: Math.max(...group.map((item) => item.lat)),
      west: Math.min(...group.map((item) => item.lon)),
      east: Math.max(...group.map((item) => item.lon)),
    })
  }
  return { points: singles, clusters }
}

export function parseOzonPoints(raw: unknown): OzonPoint[] {
  const out: OzonPoint[] = []
  const stack: unknown[] = [raw]
  while (stack.length) {
    const cur = stack.pop()
    if (!cur) continue
    if (Array.isArray(cur)) {
      for (const item of cur) stack.push(item)
      continue
    }
    const rec = asRecord(cur)
    if (!rec) continue
    if (rec.points_count != null && rec.map_point_id == null && rec.point_id == null) {
      for (const value of Object.values(rec)) {
        if (value && typeof value === "object") stack.push(value)
      }
      continue
    }
    const coord = rec.coordinate || rec.coordinates || rec.location
    const id =
      rec.id ??
      rec.point_id ??
      rec.map_point_id ??
      rec.delivery_variant_id ??
      rec.code
    const lat = firstNumber(rec.lat, rec.latitude, rec.coord_lat, coordLat(coord))
    const lon = firstNumber(
      rec.lon,
      rec.lng,
      rec.longitude,
      rec.coord_long,
      rec.long,
      coordLon(coord)
    )
    const address = firstText(
      rec.address,
      rec.full_address,
      rec.address_tail,
      rec.address_string,
      rec.point_address
    )
    const name = firstText(
      rec.name,
      rec.title,
      rec.short_name,
      rec.description,
      address
    )
    if (id != null && lat != null && lon != null) {
      out.push({
        id: String(id),
        name: name || address || `Пункт Ozon ${id}`,
        address: address || name || "",
        lat,
        lon,
        schedule: rec.schedule ? String(rec.schedule) : undefined,
        city: firstText(rec.city, rec.settlement, rec.region) || undefined,
      })
      continue
    }
    for (const value of Object.values(rec)) {
      if (value && typeof value === "object") stack.push(value)
    }
  }
  const seen = new Set<string>()
  return out.filter((point) => {
    if (seen.has(point.id)) return false
    seen.add(point.id)
    return true
  })
}

export type OzonBounds = {
  south: number
  west: number
  north: number
  east: number
}

export function nearestOzonPoints(
  points: OzonPoint[],
  center: { lat: number; lon: number },
  limit = 80
) {
  return [...points]
    .sort((a, b) => {
      const da = (a.lat - center.lat) ** 2 + (a.lon - center.lon) ** 2
      const db = (b.lat - center.lat) ** 2 + (b.lon - center.lon) ** 2
      return da - db
    })
    .slice(0, limit)
}

export function clustersInBounds(
  clusters: OzonMapCluster[],
  bounds: OzonBounds,
  limit = 80
) {
  const padLat = Math.max((bounds.north - bounds.south) * 0.02, 0.002)
  const padLon = Math.max((bounds.east - bounds.west) * 0.02, 0.002)
  return clusters
    .filter(
      (item) =>
        item.lat >= bounds.south - padLat &&
        item.lat <= bounds.north + padLat &&
        item.lon >= bounds.west - padLon &&
        item.lon <= bounds.east + padLon
    )
    .slice(0, limit)
}

export function pointsInBounds(
  points: OzonPoint[],
  bounds: OzonBounds,
  limit = 200
) {
  const padLat = Math.max((bounds.north - bounds.south) * 0.02, 0.002)
  const padLon = Math.max((bounds.east - bounds.west) * 0.02, 0.002)
  const south = bounds.south - padLat
  const north = bounds.north + padLat
  const west = bounds.west - padLon
  const east = bounds.east + padLon
  return points
    .filter(
      (point) =>
        point.lat >= south &&
        point.lat <= north &&
        point.lon >= west &&
        point.lon <= east
    )
    .slice(0, limit)
}

export function boundsFromCenter(
  center: { lat: number; lon: number },
  delta = 0.12
): OzonBounds {
  return {
    south: center.lat - delta,
    north: center.lat + delta,
    west: center.lon - delta * 1.6,
    east: center.lon + delta * 1.6,
  }
}

export function centerFromBounds(bounds: OzonBounds) {
  return {
    lat: (bounds.south + bounds.north) / 2,
    lon: (bounds.west + bounds.east) / 2,
  }
}

function parseBounds(input: {
  south?: number
  west?: number
  north?: number
  east?: number
}): OzonBounds | null {
  const south = Number(input.south)
  const west = Number(input.west)
  const north = Number(input.north)
  const east = Number(input.east)
  if (
    ![south, west, north, east].every(Number.isFinite) ||
    north <= south ||
    east <= west
  ) {
    return null
  }
  return { south, west, north, east }
}

export function ozonTrackingUrl(orderNumber?: string | null) {
  const id = String(orderNumber || "").trim()
  if (!id) return null
  return `https://www.ozon.ru/my/orderdetails/?order=${encodeURIComponent(id)}`
}

export function ozonQuoteErrorMessage(error: unknown, fromPlaceId = "") {
  const raw = error instanceof Error ? error.message : String(error || "")
  if (/no access for this service|logistic is disabled/i.test(raw)) {
    return "У приложения нет доступа к Ozon Доставка. Добавьте этот API в приложение и подключите его в кабинете."
  }
  if (/oauth-client|issued for seller/i.test(raw)) {
    return "Подключите кабинет продавца к приложению в настройках магазина."
  }
  if (/method is not allowed/i.test(raw)) {
    return "Подключите кабинет продавца Ozon в настройках магазина."
  }
  if (/invalid number of segments|failed to parse access token/i.test(raw)) {
    return "Ozon не принял доступ приложения. Подключите кабинет продавца заново."
  }
  if (/invalid_refresh_token/i.test(raw)) {
    return "Подключите кабинет продавца Ozon в настройках магазина."
  }
  if (/HTTP 401|unauthorized|access_token|invalid_client/i.test(raw)) {
    return "Ozon не принял доступ кабинета. Подключите приложение заново."
  }
  const text = raw.replace(/^Ozon HTTP \d+:\s*/i, "").trim()
  if (text && !/^keys=/i.test(text)) return text.slice(0, 280)
  return fromPlaceId
    ? "Ozon не вернул тариф доставки"
    : "В настройках не выбран пункт сдачи Ozon"
}

export function extractOzonAmount(raw: unknown): number | null {
  const preferred: number[] = []
  const fallback: number[] = []
  const stack: unknown[] = [raw]
  while (stack.length) {
    const cur = stack.pop()
    if (!cur) continue
    if (Array.isArray(cur)) {
      for (const item of cur) stack.push(item)
      continue
    }
    const rec = asRecord(cur)
    if (!rec) continue
    const units = firstNumber(rec.units)
    const nanos = firstNumber(rec.nanos)
    const currency = rec.currency_code || rec.currencyCode
    if (units != null && units > 0 && (currency || nanos != null)) {
      preferred.push(units + (nanos != null ? nanos / 1_000_000_000 : 0))
    }
    const named = firstNumber(
      rec.delivery_price,
      rec.deliveryPrice,
      rec.tariff,
      rec.delivery_cost,
      rec.deliveryCost,
      rec.shipping_price,
      rec.customer_price,
      rec.price_for_customer,
      rec.delivery_price_for_customer
    )
    if (named != null && named > 0) preferred.push(named)
    for (const [key, value] of Object.entries(rec)) {
      if (value && typeof value === "object") {
        stack.push(value)
        continue
      }
      if (!/^(amount|price|cost)$/i.test(key)) continue
      const numeric = firstNumber(value)
      if (numeric != null && numeric > 0) fallback.push(numeric)
    }
  }
  const picked = preferred[0] ?? fallback[0]
  if (picked == null || !Number.isFinite(picked) || picked <= 0) return null
  const amount = picked > 100_000 ? picked / 100 : picked
  return Math.round(amount)
}

function collectOfferSkus(raw: unknown) {
  const map = new Map<string, number>()
  const stack: unknown[] = [raw]
  while (stack.length) {
    const cur = stack.pop()
    if (!cur) continue
    if (Array.isArray(cur)) {
      for (const item of cur) stack.push(item)
      continue
    }
    const rec = asRecord(cur)
    if (!rec) continue
    const offer = firstText(rec.offer_id, rec.offerId)
    const sku = firstNumber(rec.sku)
    if (offer && sku != null && sku > 0) map.set(offer, sku)
    for (const value of Object.values(rec)) {
      if (value && typeof value === "object") stack.push(value)
    }
  }
  return map
}

async function sellerOfferSkus(creds: OzonCreds, articles: string[]) {
  const ids = [...new Set(articles.map((row) => String(row || "").trim()).filter(Boolean))]
  if (!ids.length) return new Map<string, number>()
  const attempts: Array<{ path: string; body: Record<string, unknown> }> = [
    { path: "/v3/product/info/list", body: { offer_id: ids, product_id: [], sku: [] } },
    { path: "/v2/product/info/list", body: { offer_id: ids } },
  ]
  for (const attempt of attempts) {
    try {
      const map = collectOfferSkus(await sellerPost(creds, attempt.path, attempt.body))
      if (map.size) return map
    } catch {
      // Catalog lookup is optional for the tariff.
    }
  }
  return new Map<string, number>()
}

export function ozonCartArticle(item: Record<string, unknown> | null | undefined) {
  const rec = asRecord(item)
  if (!rec) return ""
  const variant = asRecord(rec.variant) || {}
  const article = firstText(variant.sku, rec.variant_sku)
  if (!article || article === "sku") return ""
  return article
}

export function ozonCheckoutItems(
  items: Array<{ article?: string; quantity?: number; sku?: number | null }>
) {
  return items
    .map((item) => {
      const offerId = String(item.article || "").trim()
      const sku = Number(item.sku)
      const row: { offer_id?: string; sku?: number; quantity: number } = {
        quantity: Math.max(1, Math.round(Number(item.quantity) || 1)),
      }
      if (offerId) row.offer_id = offerId
      if (Number.isFinite(sku) && sku > 0) row.sku = sku
      if (!row.offer_id && row.sku == null) return null
      return row
    })
    .filter(
      (
        item
      ): item is { offer_id?: string; sku?: number; quantity: number } =>
        Boolean(item)
    )
}

async function quoteSellerDelivery(input: {
  creds: OzonCreds
  point: { id: string }
  phone?: string
  items: Array<{ article: string; quantity: number; price: number; weight?: number }>
}) {
  if (!input.point.id) return null
  const phone = normalizeOzonPhone(input.phone || "")
  const mapPointId = Number(input.point.id) || input.point.id
  const skus = await sellerOfferSkus(
    input.creds,
    input.items.map((item) => item.article)
  )
  const fromPlaceId = Number(input.creds.fromPlaceId)
  const body: Record<string, unknown> = {
    delivery_schema: "FBS",
    delivery_type: {
      pick_up: { map_point_id: mapPointId },
    },
    items: ozonCheckoutItems(
      input.items.map((item) => ({
        article: item.article,
        quantity: item.quantity,
        sku:
          skus.get(item.article) ??
          (Number.isFinite(Number(item.article)) && Number(item.article) > 0
            ? Number(item.article)
            : null),
      }))
    ),
  }
  if (Number.isFinite(fromPlaceId) && fromPlaceId > 0) {
    body.from_place_id = fromPlaceId
  }
  if (phone) {
    body.buyer_phone = phone
    body.client_phone = phone
  }
  const errors: string[] = []
  const schemas = ["FBS", "FBO"]
  for (const schema of schemas) {
    try {
      const raw = await sellerPost(input.creds, "/v2/delivery/checkout", {
        ...body,
        delivery_schema: schema,
      })
      const amount = extractOzonAmount(raw)
      if (amount != null) return amount
      const rec = asRecord(raw)
      const ozonMessage = firstText(
        rec?.message,
        asRecord(rec?.error)?.message,
        typeof rec?.error === "string" ? rec.error : ""
      )
      errors.push(
        `checkout ${schema}: ${ozonMessage || `keys=${rec ? Object.keys(rec).join(",") : typeof raw}`}`
      )
    } catch (error) {
      errors.push(
        `checkout ${schema}: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }
  if (errors.length) {
    throw new MedusaError(
      MedusaError.Types.UNEXPECTED_STATE,
      errors.join("; ").slice(0, 400)
    )
  }
  return null
}

export async function quoteOzonDelivery(input: {
  creds: OzonCreds
  point: { id: string; address?: string; lat?: number; lon?: number }
  phone?: string
  items: Array<{ article: string; quantity: number; price: number; weight?: number }>
}) {
  if (!input.point.id) return null
  return quoteSellerDelivery(input)
}

export function extractOzonCreateIds(raw: unknown) {
  const rec = asRecord(raw) || {}
  const result = asRecord(rec.result) || rec
  const nested = JSON.stringify(raw ?? {})
  const orderNumber =
    firstText(
      result.order_number,
      result.orderNumber,
      rec.order_number,
      rec.orderNumber
    ) ||
    (nested.match(/"order_number"\s*:\s*"([^"]+)"/i) || [])[1] ||
    ""
  const postingRaw =
    result.posting_number ??
    result.postingNumber ??
    result.postings ??
    rec.posting_number ??
    rec.postingNumber ??
    rec.postings
  const posting =
    firstText(
      Array.isArray(postingRaw) ? postingRaw[0] : postingRaw
    ) || (nested.match(/"posting_number"\s*:\s*"([^"]+)"/i) || [])[1] ||
    ""
  return {
    orderNumber: orderNumber || null,
    postingNumber: posting || null,
    trackingUrl: ozonTrackingUrl(orderNumber),
  }
}

export async function readJson(response: Response) {
  const text = await response.text()
  let json: unknown = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = { raw: text }
  }
  if (!response.ok) {
    throw ozonHttpError(response.status, text)
  }
  return json
}

export async function sellerRequest(
  creds: OzonCreds,
  path: string,
  body: Record<string, unknown>
) {
  const accessToken = await resolveSellerAccessToken(creds)
  const response = await fetch(`https://api-seller.ozon.ru${path}`, {
    method: "POST",
    headers: sellerAuthHeaders({ ...creds, accessToken }),
    body: JSON.stringify(body),
  })
  const buffer = Buffer.from(await response.arrayBuffer())
  const contentType = String(response.headers.get("content-type") || "")
  return { ok: response.ok, status: response.status, contentType, buffer }
}

export async function sellerPost(
  creds: OzonCreds,
  path: string,
  body: Record<string, unknown>
) {
  const raw = await sellerRequest(creds, path, body)
  const text = raw.buffer.toString("utf8")
  let json: unknown = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = { raw: text }
  }
  if (!raw.ok) {
    throw ozonHttpError(raw.status, text)
  }
  return json
}

export async function geocodeCity(city: string) {
  const query = city.trim()
  if (!query) return null
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=ru&q=${encodeURIComponent(query)}`
  const res = await fetch(url, {
    headers: { "User-Agent": "printo-shop/1.0 (ozon-pvz)" },
  })
  if (!res.ok) return null
  const rows = (await res.json()) as Array<{ lat: string; lon: string }>
  const first = rows[0]
  if (!first) return null
  return { lat: Number(first.lat), lon: Number(first.lon) }
}

async function enrichSellerPoints(creds: OzonCreds, points: OzonPoint[]) {
  const ids = points.map((point) => point.id).slice(0, 100)
  if (!ids.length) return points
  try {
    const raw = await sellerPost(creds, "/v1/delivery/point/info", {
      map_point_ids: ids.map((id) => Number(id) || id),
      ids,
    })
    const details = parseOzonPoints(raw)
    if (!details.length) return points
    const byId = new Map(details.map((point) => [point.id, point]))
    return points.map((point) => {
      const extra = byId.get(point.id)
      if (!extra) return point
      return {
        ...point,
        name: extra.name || point.name,
        address: extra.address || point.address,
        schedule: extra.schedule || point.schedule,
        city: extra.city || point.city,
        lat: extra.lat || point.lat,
        lon: extra.lon || point.lon,
      }
    })
  } catch {
    return points
  }
}

async function loadSellerPoints(
  creds: OzonCreds,
  bounds: OzonBounds,
  center: { lat: number; lon: number },
  zoom: number
): Promise<{ points: OzonPoint[]; clusters: OzonMapCluster[] }> {
  try {
    const raw = await sellerPost(creds, "/v1/delivery/map", {
      zoom: Math.round(Math.min(19, Math.max(0, zoom))),
      viewport: {
        left_bottom: {
          latitude: bounds.south,
          longitude: bounds.west,
        },
        right_top: {
          latitude: bounds.north,
          longitude: bounds.east,
        },
      },
    })
    const points = pointsInBounds(parseOzonPoints(raw), bounds)
    const clusters = clustersInBounds(parseOzonClusters(raw), bounds)
    if (zoom >= PVZ_PIN_ZOOM && points.length) {
      return {
        points: await enrichSellerPoints(creds, points),
        clusters: [],
      }
    }
    if (zoom < PVZ_PIN_ZOOM && (points.length || clusters.length)) {
      return {
        points: await enrichSellerPoints(creds, points),
        clusters,
      }
    }
  } catch {
    // Fall through to the full list, then clip to the viewport.
  }
  const raw = await sellerPost(creds, "/v1/delivery/point/list", {
    latitude: center.lat,
    longitude: center.lon,
  })
  return {
    points: await enrichSellerPoints(
      creds,
      pointsInBounds(parseOzonPoints(raw), bounds)
    ),
    clusters: [],
  }
}

export async function loadOzonPoints(
  row: Record<string, unknown>,
  input: {
    city?: string
    query?: string
    lat?: number
    lon?: number
    south?: number
    west?: number
    north?: number
    east?: number
    zoom?: number
    phone?: string
  }
) {
  const creds = ozonCredsFromRow(row)
  const query = String(input.query || input.city || "").trim()
  let bounds = parseBounds(input)
  let center =
    Number.isFinite(input.lat) && Number.isFinite(input.lon)
      ? { lat: Number(input.lat), lon: Number(input.lon) }
      : null
  if (query && !center) {
    center = await geocodeCity(query)
    if (!center && !bounds) {
      return {
        configured: Boolean(creds),
        points: [] as OzonPoint[],
        clusters: [] as OzonMapCluster[],
        center: null,
        message: "Не нашли это место.",
      }
    }
  }
  if (!bounds && center) {
    bounds = boundsFromCenter(center)
  }
  if (!center && bounds) {
    center = centerFromBounds(bounds)
  }
  if (!center) {
    center = { lat: 55.751244, lon: 37.618423 }
  }
  if (!bounds) {
    bounds = boundsFromCenter(center)
  }
  const zoom = Number(input.zoom)
  if (!creds) {
    return {
      configured: false,
      points: [] as OzonPoint[],
      clusters: [] as OzonMapCluster[],
      center,
      message: "Подключите Ozon Доставку в настройках магазина.",
    }
  }
  try {
    const phone = normalizeOzonPhone(input.phone || "")
    if (phone) {
      try {
        await sellerPost(creds, "/v1/delivery/check", {
          client_phone: phone,
          phone,
        })
      } catch {
        // Availability check is best-effort until the cabinet is enabled.
      }
    }
    const loaded = await loadSellerPoints(
      creds,
      bounds,
      center,
      Number.isFinite(zoom) ? zoom : 12
    )
    const grouped = loaded.clusters.length
      ? loaded
      : clusterOzonPoints(loaded.points, Number.isFinite(zoom) ? zoom : 12)
    const layers = resolveOzonMapLayers(
      grouped.points,
      grouped.clusters,
      Number.isFinite(zoom) ? zoom : 12
    )
    return {
      configured: true,
      points: layers.points,
      clusters: layers.clusters,
      center,
      message: layers.points.length
        ? null
        : layers.clusters.length
          ? "Нажмите на цифру, чтобы увидеть пункты."
          : "В этой области пунктов нет. Сдвиньте карту или найдите другой город.",
    }
  } catch (error) {
    return {
      configured: true,
      points: [] as OzonPoint[],
      clusters: [] as OzonMapCluster[],
      center,
      message: ozonQuoteErrorMessage(error),
    }
  }
}

export async function loadOzonPointById(
  row: Record<string, unknown>,
  id: string
) {
  const creds = ozonCredsFromRow(row)
  const pointId = String(id || "").trim()
  if (!creds || !pointId) return null
  const stub: OzonPoint = {
    id: pointId,
    name: `Пункт ${pointId}`,
    address: "",
    lat: 0,
    lon: 0,
  }
  const [enriched] = await enrichSellerPoints(creds, [stub])
  return enriched || stub
}

function splitName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  return {
    first: parts[0] || "Покупатель",
    last: parts.slice(1).join(" ") || parts[0] || "Покупатель",
  }
}

async function createSellerOrder(input: {
  creds: OzonCreds
  buyer: { name: string; phone: string; email?: string }
  point: { id: string; address: string }
  items: Array<{ article: string; name: string; quantity: number; price: number }>
}) {
  const names = splitName(input.buyer.name)
  const phone = normalizeOzonPhone(input.buyer.phone)
  const mapPointId = Number(input.point.id) || input.point.id
  const checkout = (await sellerPost(input.creds, "/v2/delivery/checkout", {
    buyer_phone: phone,
    delivery_schema: "FBS",
    from_place_id: Number(input.creds.fromPlaceId) || input.creds.fromPlaceId,
    delivery_type: {
      pick_up: { map_point_id: mapPointId },
    },
    items: ozonCheckoutItems(
      input.items.map((item) => ({
        article: item.article,
        quantity: item.quantity,
      }))
    ),
  })) as Record<string, unknown>
  const splits = Array.isArray(checkout.splits) ? checkout.splits : []
  const schema =
    firstText(
      asRecord(splits[0])?.delivery_schema,
      checkout.delivery_schema
    ) || "FBS"
  return sellerPost(input.creds, "/v2/order/create", {
    buyer: {
      first_name: names.first,
      last_name: names.last,
      phone,
    },
    recipient: {
      recipient_first_name: names.first,
      recipient_last_name: names.last,
      phone,
    },
    delivery: {
      pick_up: { map_point_id: mapPointId },
    },
    delivery_schema: schema,
    splits,
  })
}

export async function createOzonDeliveryOrder(input: {
  creds: OzonCreds
  orderNumber: string
  buyer: { name: string; phone: string; email?: string }
  point: { id: string; address: string }
  amount: number
  items: Array<{ article: string; name: string; quantity: number; price: number }>
}) {
  return createSellerOrder(input)
}
