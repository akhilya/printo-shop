import { MedusaError } from "@medusajs/framework/utils"
import { publicBackendUrl } from "./public-url"

export type OzonRequestDump = {
  method: "POST"
  url: string
  path: string
  body: unknown
}

function ozonHttpError(status: number, text: string) {
  return new MedusaError(
    MedusaError.Types.UNEXPECTED_STATE,
    `Ozon HTTP ${status}: ${text.slice(0, 1500)}`
  )
}

export function dumpOzonRequest(
  path: string,
  body: unknown
): OzonRequestDump {
  return {
    method: "POST",
    url: `https://api-seller.ozon.ru${path}`,
    path,
    body,
  }
}

export function ozonRequestsOf(error: unknown): OzonRequestDump[] {
  if (!error || typeof error !== "object") return []
  const value = (error as { ozonRequests?: unknown }).ozonRequests
  return Array.isArray(value) ? (value as OzonRequestDump[]) : []
}

export function withOzonRequests<T>(error: T, requests: OzonRequestDump[]): T {
  if (!error || typeof error !== "object") return error
  const next: OzonRequestDump[] = []
  const seen = new Set<string>()
  for (const request of [...ozonRequestsOf(error), ...requests]) {
    const key = `${request.path}:${JSON.stringify(request.body)}`
    if (seen.has(key)) continue
    seen.add(key)
    next.push(request)
  }
  ;(error as T & { ozonRequests: OzonRequestDump[] }).ozonRequests = next
  return error
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

export function ozonSellerReady(
  creds: OzonCreds | null | undefined
): creds is OzonCreds {
  if (!creds) return false
  return Boolean(creds.refreshToken) || isOzonAccessToken(creds.accessToken)
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

type PvzCacheEntry = {
  points: OzonPoint[]
  clusters: OzonMapCluster[]
  expiresAt: number
}

const PVZ_CACHE_TTL_MS = 30 * 60 * 1000
const pvzCache = new Map<string, PvzCacheEntry>()
const pvzInflight = new Map<
  string,
  Promise<{ points: OzonPoint[]; clusters: OzonMapCluster[] }>
>()

export function resetOzonPvzCache() {
  pvzCache.clear()
  pvzInflight.clear()
}

function quantizeCoord(n: number, digits: number) {
  const f = 10 ** digits
  return Math.round(Number(n) * f) / f
}

function pvzCacheKey(
  clientId: string,
  bounds: OzonBounds,
  zoom: number
) {
  const view = normalizeOzonBounds(bounds)
  const z = Number.isFinite(zoom) ? zoom : 12
  const pin = z >= PVZ_PIN_ZOOM
  const zoomKey = pin ? PVZ_PIN_ZOOM : Math.max(0, Math.floor(z / 2) * 2)
  const digits = pin ? 2 : 1
  return [
    clientId || "anon",
    zoomKey,
    quantizeCoord(view.south, digits),
    quantizeCoord(view.west, digits),
    quantizeCoord(view.north, digits),
    quantizeCoord(view.east, digits),
  ].join(":")
}

function readPvzCache(key: string) {
  const hit = pvzCache.get(key)
  if (!hit) return null
  if (hit.expiresAt <= Date.now()) {
    pvzCache.delete(key)
    return null
  }
  return { points: hit.points, clusters: hit.clusters }
}

function writePvzCache(
  key: string,
  value: { points: OzonPoint[]; clusters: OzonMapCluster[] }
) {
  if (pvzCache.size >= 64) {
    const first = pvzCache.keys().next().value
    if (first) pvzCache.delete(first)
  }
  pvzCache.set(key, {
    points: value.points,
    clusters: value.clusters,
    expiresAt: Date.now() + PVZ_CACHE_TTL_MS,
  })
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

export function normalizeOzonPhone(phone: unknown) {
  if (phone && typeof phone === "object") {
    const rec = phone as Record<string, unknown>
    return normalizeOzonPhone(rec.number ?? rec.phone ?? rec.value)
  }
  const digits = String(phone || "").replace(/\D/g, "")
  if (!digits) return ""
  let normalized = digits
  if (digits.length === 11 && digits.startsWith("8")) {
    normalized = `7${digits.slice(1)}`
  } else if (digits.length === 10) {
    normalized = `7${digits}`
  }
  return /^\d{10,15}$/.test(normalized) ? normalized : ""
}

export function ozonOrderContacts(buyer: { name: string; phone?: unknown }) {
  const names = splitName(String(buyer.name || ""))
  const phone = normalizeOzonPhone(buyer.phone)
  return {
    buyer: {
      first_name: names.first,
      last_name: names.last,
      phone,
    },
    recipient: {
      recipient_first_name: names.first,
      recipient_last_name: names.last,
      recipient_phone: phone,
    },
    phone,
  }
}

export function ozonPackErrorMessage(error: unknown) {
  const raw = error instanceof Error ? error.message : String(error || "")
  if (
    /RecipientPhone|recipient_phone|does not match regex|проверьте телефон/i.test(
      raw
    )
  ) {
    return "Не удалось создать отправление: проверьте телефон получателя."
  }
  return ozonAdminErrorMessage(error)
}

export function ozonAdminErrorMessage(error: unknown) {
  const raw = error instanceof Error ? error.message : String(error || "")
  const trimmed = raw.trim()
  if (!trimmed) {
    return "Не удалось создать отправление Ozon. Попробуйте ещё раз."
  }
  const status = trimmed.match(/Ozon HTTP (\d+)/i)?.[1]
  let detail = ""
  const jsonStart = trimmed.indexOf("{")
  if (jsonStart >= 0) {
    try {
      const json = JSON.parse(trimmed.slice(jsonStart)) as Record<string, unknown>
      detail = firstText(json.message, json.error, asRecord(json.error)?.message)
    } catch {
      const match = trimmed.match(/"message"\s*:\s*"((?:\\.|[^"\\])*)"/)
      if (match?.[1]) {
        detail = match[1].replace(/\\"/g, '"').replace(/\\n/g, " ")
      }
    }
  }
  if (detail) {
    return [status ? `Ozon ${status}` : null, detail].filter(Boolean).join(": ").slice(0, 1500)
  }
  if (/Ozon HTTP|\bHTTP\s*\d+|[{"]/.test(trimmed) && !/[А-Яа-яЁё]/.test(trimmed)) {
    return [status ? `Ozon ${status}` : null, trimmed.replace(/^Ozon HTTP \d+:\s*/i, "")]
      .filter(Boolean)
      .join(": ")
      .slice(0, 1500)
  }
  return trimmed.slice(0, 1500)
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

export function parseOzonMapPointIds(raw: unknown): string[] {
  const ids: string[] = []
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
    const list = Array.isArray(rec.map_point_ids)
      ? rec.map_point_ids
      : rec.map_point_id != null
        ? [rec.map_point_id]
        : []
    for (const value of list) {
      const id = String(value ?? "").trim()
      if (id) ids.push(id)
    }
    for (const value of Object.values(rec)) {
      if (value && typeof value === "object") stack.push(value)
    }
  }
  return [...new Set(ids)]
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
    if (rec.enabled === false) continue
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

function clampOzonLat(value: number) {
  return Math.max(-85, Math.min(85, value))
}

function tileLonStrip(
  south: number,
  west: number,
  north: number,
  east: number,
  maxLonSpan: number
): OzonBounds[] {
  const span = east - west
  if (span <= 0) return []
  if (span <= maxLonSpan) {
    return [{ south, west, north, east }]
  }
  const count = Math.min(6, Math.max(2, Math.ceil(span / maxLonSpan)))
  const step = span / count
  const tiles: OzonBounds[] = []
  for (let i = 0; i < count; i++) {
    tiles.push({
      south,
      north,
      west: west + i * step,
      east: i === count - 1 ? east : west + (i + 1) * step,
    })
  }
  return tiles
}

export function normalizeOzonBounds(bounds: OzonBounds): OzonBounds {
  let south = clampOzonLat(bounds.south)
  let north = clampOzonLat(bounds.north)
  let west = bounds.west
  let east = bounds.east
  if (north < south) {
    const swap = south
    south = north
    north = swap
  }
  if (east < west) east += 360
  if (east - west > 360) {
    const mid = (west + east) / 2
    west = mid - 180
    east = mid + 180
  }
  while (east < -180) {
    west += 360
    east += 360
  }
  while (west > 180) {
    west -= 360
    east -= 360
  }
  west = Math.max(-180, west)
  east = Math.min(180, east)
  if (east <= west) {
    return { south, west: 19, north, east: 180 }
  }
  return { south, west, north, east }
}

export function tileOzonBounds(
  bounds: OzonBounds,
  maxLonSpan = 50
): OzonBounds[] {
  const south = clampOzonLat(Math.min(bounds.south, bounds.north))
  const north = clampOzonLat(Math.max(bounds.north, bounds.south))
  if (bounds.east < bounds.west) {
    return [
      ...tileLonStrip(south, bounds.west, north, 180, maxLonSpan),
      ...tileLonStrip(south, -180, north, bounds.east, maxLonSpan),
    ].slice(0, 6)
  }
  const view = normalizeOzonBounds(bounds)
  return tileLonStrip(south, view.west, north, view.east, maxLonSpan)
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
  limit = 400
) {
  const view = normalizeOzonBounds(bounds)
  const padLat = Math.max((view.north - view.south) * 0.02, 0.002)
  const padLon = Math.max((view.east - view.west) * 0.02, 0.002)
  const inView = clusters.filter(
    (item) =>
      item.lat >= view.south - padLat &&
      item.lat <= view.north + padLat &&
      item.lon >= view.west - padLon &&
      item.lon <= view.east + padLon
  )
  if (inView.length <= limit) return inView
  const sorted = [...inView].sort(
    (a, b) => a.lon - b.lon || a.lat - b.lat
  )
  const step = sorted.length / limit
  const out: OzonMapCluster[] = []
  const seen = new Set<number>()
  for (let i = 0; i < limit; i++) {
    const index = Math.min(sorted.length - 1, Math.floor(i * step))
    if (seen.has(index)) continue
    seen.add(index)
    out.push(sorted[index])
  }
  return out
}

export function pointsInBounds(
  points: OzonPoint[],
  bounds: OzonBounds,
  limit = 400
) {
  const view = normalizeOzonBounds(bounds)
  const padLat = Math.max((view.north - view.south) * 0.02, 0.002)
  const padLon = Math.max((view.east - view.west) * 0.02, 0.002)
  const south = view.south - padLat
  const north = view.north + padLat
  const west = view.west - padLon
  const east = view.east + padLon
  const inView = points.filter(
    (point) =>
      point.lat >= south &&
      point.lat <= north &&
      point.lon >= west &&
      point.lon <= east
  )
  if (inView.length <= limit) return inView
  const sorted = [...inView].sort(
    (a, b) => a.lon - b.lon || a.lat - b.lat
  )
  const step = sorted.length / limit
  const out: OzonPoint[] = []
  const seen = new Set<number>()
  for (let i = 0; i < limit; i++) {
    const index = Math.min(sorted.length - 1, Math.floor(i * step))
    if (seen.has(index)) continue
    seen.add(index)
    out.push(sorted[index])
  }
  return out
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
  if (![south, west, north, east].every(Number.isFinite) || north === south) {
    return null
  }
  if (east === west && Math.abs(east) <= 180) return null
  return normalizeOzonBounds({ south, west, north, east })
}

export function ozonTrackingUrl(orderNumber?: string | null) {
  const id = String(orderNumber || "").trim()
  if (!id) return null
  return `https://www.ozon.ru/my/orderdetails/?order=${encodeURIComponent(id)}`
}

export function ozonQuoteErrorMessage(error: unknown, fromPlaceId = "") {
  const raw = error instanceof Error ? error.message : String(error || "")
  if (
    /no access for this service|logistic is disabled|oauth-client|issued for seller|method is not allowed|invalid number of segments|failed to parse access token|invalid_refresh_token|HTTP 401|unauthorized|access_token|invalid_client|подключите|кабинет продавца|настройках магазина/i.test(
      raw
    )
  ) {
    return fromPlaceId
      ? "Не удалось посчитать доставку"
      : "Не удалось загрузить пункты выдачи."
  }
  if (/Ozon HTTP|\bHTTP \s*\d+|[{"]/.test(raw)) {
    return fromPlaceId
      ? "Не удалось посчитать доставку"
      : "Не удалось загрузить пункты выдачи."
  }
  if (/[А-Яа-яЁё]/.test(raw) && !/[A-Za-z]{4,}/.test(raw.replace(/Ozon/gi, ""))) {
    return raw.slice(0, 280)
  }
  return fromPlaceId
    ? "Не удалось посчитать доставку"
    : "Не удалось загрузить пункты выдачи."
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
    { path: "/v3/product/info/list", body: { offer_id: ids } },
  ]
  const numeric = ids
    .map((id) => Number(id))
    .filter((id) => Number.isFinite(id) && id > 0)
  if (numeric.length) {
    attempts.push({
      path: "/v3/product/info/list",
      body: { sku: numeric },
    })
  }
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
  const meta = {
    ...(asRecord(rec.metadata) || {}),
    ...(asRecord(variant.metadata) || {}),
  }
  const article = firstText(
    variant.sku,
    rec.variant_sku,
    rec.sku,
    rec.article,
    rec.product_sku,
    variant.barcode,
    rec.variant_barcode,
    meta.sku,
    meta.offer_id,
    meta.ozon_offer_id
  )
  if (!article || article === "sku") return ""
  if (/^(orli_|ordli_|item_|prod_|variant_|var_|order_)/i.test(article)) {
    return ""
  }
  if (/^[a-z]+_01[A-Z0-9]{16,}$/i.test(article)) return ""
  return article
}

export function ozonOrderItemsFromLines(
  items: Array<Record<string, unknown>>,
  amount: (value: unknown) => number
) {
  return items.map((item) => {
    const variant = asRecord(item.variant) || {}
    const product = asRecord(variant.product) || {}
    return {
      article: ozonCartArticle(item),
      name: String(product.title || item.title || "Товар"),
      quantity: Number(item.quantity || 1),
      price: amount(item.unit_price),
    }
  })
}

export function hydrateOzonLineItems(
  items: Array<Record<string, unknown>>,
  variants: Array<Record<string, unknown>>
) {
  const byId = new Map<string, Record<string, unknown>>()
  for (const variant of variants) {
    const id = firstText(variant.id)
    if (id) byId.set(id, variant)
  }
  return items.map((item) => {
    if (ozonCartArticle(item)) return item
    const variantId = firstText(item.variant_id, asRecord(item.variant)?.id)
    const found = variantId ? byId.get(variantId) : undefined
    if (!found) return item
    return {
      ...item,
      variant: {
        ...(asRecord(item.variant) || {}),
        sku: found.sku ?? asRecord(item.variant)?.sku,
        barcode: found.barcode ?? asRecord(item.variant)?.barcode,
        metadata: {
          ...(asRecord(asRecord(item.variant)?.metadata) || {}),
          ...(asRecord(found.metadata) || {}),
        },
      },
    }
  })
}

export async function ozonOrderItemsForCreate(
  items: Array<Record<string, unknown>>,
  amount: (value: unknown) => number,
  loadVariants?: (
    ids: string[]
  ) => Promise<Array<Record<string, unknown>>>
) {
  let lines = items
  if (loadVariants) {
    const ids = [
      ...new Set(
        lines
          .filter((item) => !ozonCartArticle(item))
          .map((item) => firstText(item.variant_id, asRecord(item.variant)?.id))
          .filter(Boolean)
      ),
    ]
    if (ids.length) {
      lines = hydrateOzonLineItems(lines, await loadVariants(ids))
    }
  }
  return ozonOrderItemsFromLines(lines, amount)
}

export function ozonOfferArticle(value: unknown) {
  return ozonCartArticle({ article: value, sku: value })
}

export function ozonCheckoutItems(
  items: Array<{ article?: string; quantity?: number; sku?: number | null }>
) {
  return items
    .map((item) => {
      const offerId = ozonOfferArticle(item.article)
      const sku = Number(item.sku)
      const row: { offer_id?: string; sku?: number; quantity: number } = {
        quantity: Math.max(1, Math.round(Number(item.quantity) || 1)),
      }
      if (offerId) row.offer_id = offerId
      else if (Number.isFinite(sku) && sku > 0) row.sku = sku
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
  const mapPointId = Number(input.point.id)
  if (!Number.isFinite(mapPointId) || mapPointId <= 0) return null
  const quotedItems = input.items.map((item) => ({
    ...item,
    article: ozonOfferArticle(item.article),
  }))
  const skus = await sellerOfferSkus(
    input.creds,
    quotedItems.map((item) => item.article)
  )
  const checkoutItems = ozonCheckoutItems(
    quotedItems.map((item) => ({
      article: item.article,
      quantity: item.quantity,
      sku:
        skus.get(item.article) ??
        (Number.isFinite(Number(item.article)) && Number(item.article) > 0
          ? Number(item.article)
          : null),
    }))
  )
  if (!checkoutItems.length) return null
  const body: Record<string, unknown> = {
    delivery_schema: "FBS",
    delivery_type: {
      pick_up: { map_point_id: mapPointId },
    },
    items: checkoutItems,
  }
  if (phone) {
    body.buyer_phone = phone
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
      ozonQuoteErrorMessage(errors.join("; "), "fromPlace")
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

function ozonUtc(date: Date) {
  return date.toISOString().replace(/\.\d{3}Z$/, "Z")
}

export function parseOzonPostingNumbers(raw: unknown): string[] {
  const rec = asRecord(raw) || {}
  const result = asRecord(rec.result) || rec
  const rows = Array.isArray(result.postings)
    ? result.postings
    : Array.isArray(rec.postings)
      ? rec.postings
      : []
  const numbers: string[] = []
  for (const row of rows) {
    const posting = asRecord(row)
    const number = firstText(
      posting?.posting_number,
      posting?.postingNumber,
      typeof row === "string" ? row : ""
    )
    if (number) numbers.push(number)
  }
  return [...new Set(numbers)]
}

export async function listOzonPostingsByOrder(
  creds: OzonCreds,
  orderNumber: string
) {
  const id = String(orderNumber || "").trim()
  if (!id) return [] as string[]
  const to = new Date()
  const since = new Date(to.getTime() - 14 * 24 * 60 * 60 * 1000)
  const raw = await sellerPost(creds, "/v4/posting/fbs/list", {
    filter: {
      order_numbers: [id],
      since: ozonUtc(since),
      to: ozonUtc(to),
    },
    limit: 50,
  })
  return parseOzonPostingNumbers(raw)
}

export async function completeOzonCreateIds(
  creds: OzonCreds,
  created: unknown
) {
  const ids = extractOzonCreateIds(created)
  if (ids.postingNumber || !ids.orderNumber) return ids
  try {
    const listed = await listOzonPostingsByOrder(creds, ids.orderNumber)
    if (listed[0]) {
      return {
        ...ids,
        postingNumber: listed[0],
        trackingUrl: ids.trackingUrl || ozonTrackingUrl(ids.orderNumber),
      }
    }
  } catch {
    // Pack can resolve the posting number later.
  }
  return ids
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
    throw withOzonRequests(ozonHttpError(raw.status, text), [
      dumpOzonRequest(path, body),
    ])
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
      map_point_ids: ids.map((id) => String(id)),
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

export function ozonMapViewport(bounds: OzonBounds) {
  const view = normalizeOzonBounds(bounds)
  return {
    left_bottom: { lat: view.south, long: view.west },
    right_top: { lat: view.north, long: view.east },
  }
}

function mergeSellerMapParts(
  parts: Array<{ points: OzonPoint[]; clusters: OzonMapCluster[] }>,
  bounds: OzonBounds
) {
  const points: OzonPoint[] = []
  const clusters: OzonMapCluster[] = []
  const seenPoint = new Set<string>()
  const seenCluster = new Set<string>()
  for (const part of parts) {
    for (const point of part.points) {
      if (seenPoint.has(point.id)) continue
      seenPoint.add(point.id)
      points.push(point)
    }
    for (const cluster of part.clusters) {
      const key = `${cluster.lat}:${cluster.lon}:${cluster.count}`
      if (seenCluster.has(key)) continue
      seenCluster.add(key)
      clusters.push(cluster)
    }
  }
  return {
    points: pointsInBounds(points, bounds),
    clusters: clustersInBounds(clusters, bounds),
  }
}

async function loadSellerMapTile(
  creds: OzonCreds,
  bounds: OzonBounds,
  zoom: number
): Promise<{ points: OzonPoint[]; clusters: OzonMapCluster[] } | null> {
  try {
    const raw = await sellerPost(creds, "/v1/delivery/map", {
      zoom: Math.round(Math.min(19, Math.max(0, zoom))),
      viewport: ozonMapViewport(bounds),
    })
    const clusters = clustersInBounds(parseOzonClusters(raw), bounds)
    const mapIds = parseOzonMapPointIds(raw)
    const fromMap = pointsInBounds(parseOzonPoints(raw), bounds)
    if (zoom >= PVZ_PIN_ZOOM) {
      const stubs =
        mapIds.length > 0
          ? mapIds.slice(0, 100).map((id) => ({
              id,
              name: `Пункт ${id}`,
              address: "",
              lat: 0,
              lon: 0,
            }))
          : fromMap
      const detailed = await enrichSellerPoints(creds, stubs)
      const located = detailed.filter(
        (point) =>
          Number.isFinite(point.lat) &&
          Number.isFinite(point.lon) &&
          (point.lat !== 0 || point.lon !== 0)
      )
      const inView = pointsInBounds(located, bounds)
      if (inView.length) {
        return { points: inView, clusters: [] }
      }
    }
    if (fromMap.length || clusters.length) {
      return {
        points:
          zoom < PVZ_PIN_ZOOM
            ? await enrichSellerPoints(creds, fromMap)
            : fromMap,
        clusters,
      }
    }
    return { points: [], clusters: [] }
  } catch {
    return null
  }
}

async function loadSellerPoints(
  creds: OzonCreds,
  bounds: OzonBounds,
  _center: { lat: number; lon: number },
  zoom: number
): Promise<{ points: OzonPoint[]; clusters: OzonMapCluster[] }> {
  const tiles = tileOzonBounds(bounds)
  const parts = (
    await Promise.all(
      tiles.map((tile) => loadSellerMapTile(creds, tile, zoom))
    )
  ).filter(
    (
      part
    ): part is { points: OzonPoint[]; clusters: OzonMapCluster[] } =>
      Boolean(part && (part.points.length || part.clusters.length))
  )
  if (parts.length) {
    return mergeSellerMapParts(parts, bounds)
  }
  const raw = await sellerPost(creds, "/v1/delivery/point/list", {})
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
  if (!ozonSellerReady(creds)) {
    return {
      configured: false,
      points: [] as OzonPoint[],
      clusters: [] as OzonMapCluster[],
      center,
      message: "Не удалось загрузить пункты выдачи.",
    }
  }
  try {
    const mapZoom = Number.isFinite(zoom) ? zoom : 12
    const cacheKey = pvzCacheKey(creds.clientId || creds.accessToken, bounds, mapZoom)
    let loaded = readPvzCache(cacheKey)
    if (!loaded) {
      const phone = normalizeOzonPhone(input.phone || "")
      if (phone) {
        try {
          await sellerPost(creds, "/v1/delivery/check", {
            client_phone: phone,
          })
        } catch {
          // Availability check is best-effort until the cabinet is enabled.
        }
      }
      let pending = pvzInflight.get(cacheKey)
      if (!pending) {
        pending = loadSellerPoints(creds, bounds, center, mapZoom).then(
          (value) => {
            writePvzCache(cacheKey, value)
            return value
          }
        )
        pvzInflight.set(cacheKey, pending)
        pending.finally(() => pvzInflight.delete(cacheKey))
      }
      loaded = await pending
    }
    const grouped = loaded.clusters.length
      ? loaded
      : clusterOzonPoints(loaded.points, mapZoom)
    const layers = resolveOzonMapLayers(
      grouped.points,
      grouped.clusters,
      mapZoom
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

export function ozonCreateDeliveryType(
  raw: unknown
): "PVZ" | "POSTAMAT" | "COURIER" {
  const text = String(raw || "").trim().toUpperCase()
  if (text === "POSTAMAT" || text === "PICKPOINT") return "POSTAMAT"
  if (text === "COURIER") return "COURIER"
  return "PVZ"
}

function ozonCreateSchema(raw: unknown, fallback = "FBS") {
  const text = String(raw || "").trim().toUpperCase()
  if (text === "FBO" || text === "FBS" || text === "MIX") return text
  return fallback
}

function ozonCreateMoney(value: unknown) {
  const rec = asRecord(value)
  if (rec) {
    const units = firstNumber(rec.units)
    if (units != null && units >= 0) {
      const money: { currency_code: string; units: number; nanos?: number } = {
        currency_code: firstText(rec.currency_code, rec.currencyCode) || "RUB",
        units: Math.round(units),
      }
      const nanos = firstNumber(rec.nanos)
      if (nanos) money.nanos = nanos
      return money
    }
  }
  const units = firstNumber(value)
  return {
    currency_code: "RUB",
    units: Math.max(0, Math.round(units || 0)),
  }
}

function ozonCreateTimeslot(method: Record<string, unknown>) {
  const nested = Array.isArray(method.timeslots)
    ? method.timeslots
    : Array.isArray(method.time_slots)
      ? method.time_slots
      : []
  const rows = [...nested, method]
  for (const row of rows) {
    const rec = asRecord(row)
    if (!rec) continue
    const timeslotId = firstNumber(
      rec.timeslot_id,
      rec.timeslotId,
      rec.slot_id,
      rec.id
    )
    const range =
      asRecord(rec.logistic_date_range) ||
      asRecord(rec.logisticDateRange) ||
      asRecord(rec.client_date_range) ||
      asRecord(rec.clientDateRange)
    const from = firstText(range?.from, range?.start)
    const to = firstText(range?.to, range?.end)
    if (timeslotId != null && timeslotId > 0 && from && to) {
      return {
        timeslot_id: timeslotId,
        logistic_date_range: { from, to },
      }
    }
  }
  return null
}

export function ozonOrderCreateSplits(
  checkout: unknown,
  input: {
    items: Array<{
      article: string
      quantity: number
      price: number
      sku?: number | null
    }>
    fromPlaceId?: string
  }
) {
  const rec = asRecord(checkout) || {}
  const rawSplits = Array.isArray(rec.splits) ? rec.splits : []
  const cartByOffer = new Map(
    input.items.map((item) => [String(item.article || "").trim(), item])
  )
  const notes: string[] = []
  if (!rawSplits.length) {
    const keys = Object.keys(rec).join(", ") || "пусто"
    throw new MedusaError(
      MedusaError.Types.UNEXPECTED_STATE,
      `Ozon checkout без отправлений (${keys})`
    )
  }
  const splits = rawSplits
    .map((row, index) => {
      const split = asRecord(row)
      if (!split) return null
      const methods = Array.isArray(split.delivery_methods)
        ? split.delivery_methods
        : [split.delivery_method || split.deliveryMethod]
      let method: Record<string, unknown> | null = null
      let slot: ReturnType<typeof ozonCreateTimeslot> = null
      for (const candidate of methods) {
        const next = asRecord(candidate)
        if (!next) continue
        const reason = firstText(next.unavailable_reason, split.unavailable_reason)
        const found = ozonCreateTimeslot(next) || ozonCreateTimeslot(split)
        if (reason && reason !== "UNSPECIFIED" && !found) {
          notes.push(`сплит ${index + 1}: ${reason}`)
          continue
        }
        if (found) {
          method = next
          slot = found
          break
        }
        if (!method) method = next
      }
      if (!method || !slot) {
        if (!notes.some((note) => note.startsWith(`сплит ${index + 1}:`))) {
          notes.push(`сплит ${index + 1}: нет интервала доставки`)
        }
        return null
      }
      const methodId = firstNumber(
        method.delivery_method_id,
        method.deliveryMethodId,
        method.id
      )
      const warehouseId = firstNumber(
        split.warehouse_id,
        split.warehouseId,
        input.fromPlaceId
      )
      if (methodId == null || methodId <= 0) {
        notes.push(`сплит ${index + 1}: нет способа доставки`)
        return null
      }
      if (warehouseId == null || warehouseId <= 0) {
        notes.push(`сплит ${index + 1}: нет склада отправления`)
        return null
      }
      const splitItems = Array.isArray(split.items) ? split.items : []
      const source = splitItems.length ? splitItems : input.items
      const items = source
        .map((item) => {
          const recItem = asRecord(item) || (item as unknown as Record<string, unknown>)
          const recId = asRecord(recItem.id) || {}
          const offer = firstText(
            recItem.offer_id,
            recItem.offerId,
            recId.offer_id,
            recId.offerId,
            recItem.article
          )
          const cart = cartByOffer.get(offer)
          const sku = firstNumber(recItem.sku, recId.sku, cart?.sku)
          const quantity = Math.max(
            1,
            Math.round(firstNumber(recItem.quantity, cart?.quantity) || 1)
          )
          const rowItem: {
            quantity: number
            price: { currency_code: string; units: number; nanos?: number }
            offer_id?: string
            sku?: number
          } = {
            quantity,
            price: ozonCreateMoney(recItem.price ?? cart?.price),
          }
          if (offer) rowItem.offer_id = offer
          else if (sku != null && sku > 0) rowItem.sku = sku
          else {
            notes.push(
              `сплит ${index + 1}: нет SKU Ozon для ${offer || "товара"}`
            )
            return null
          }
          return rowItem
        })
        .filter(
          (
            item
          ): item is {
            quantity: number
            price: { currency_code: string; units: number; nanos?: number }
            offer_id?: string
            sku?: number
          } => Boolean(item)
        )
      if (!items.length) return null
      const deliveryMethod: Record<string, unknown> = {
        delivery_method_id: methodId,
        delivery_type: ozonCreateDeliveryType(
          method.delivery_type ?? method.deliveryType
        ),
        timeslot_id: slot.timeslot_id,
        logistic_date_range: slot.logistic_date_range,
      }
      const price = asRecord(method.price)
      if (price && (firstNumber(price.units) || 0) > 0) {
        deliveryMethod.price = ozonCreateMoney(price)
      }
      return {
        warehouse_id: warehouseId,
        delivery_method: deliveryMethod,
        items,
      }
    })
    .filter(Boolean)
  if (!splits.length) {
    throw new MedusaError(
      MedusaError.Types.UNEXPECTED_STATE,
      notes[0]
        ? `Ozon checkout: ${notes.slice(0, 4).join("; ")}`
        : "Ozon checkout не удалось разобрать"
    )
  }
  return splits
}

async function createSellerOrder(input: {
  creds: OzonCreds
  buyer: { name: string; phone: string; email?: string }
  point: { id: string; address: string }
  items: Array<{ article: string; name: string; quantity: number; price: number }>
}) {
  const contacts = ozonOrderContacts(input.buyer)
  if (!contacts.phone) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Не удалось создать отправление: проверьте телефон получателя."
    )
  }
  const mapPointId = Number(input.point.id)
  if (!Number.isFinite(mapPointId) || mapPointId <= 0) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `Некорректный пункт выдачи: ${input.point.id || "пусто"}`
    )
  }
  const cartItems = input.items.map((item) => {
    const article = ozonOfferArticle(item.article)
    return {
      article,
      quantity: item.quantity,
      price: item.price,
      sku: null as number | null,
    }
  })
  const skus = await sellerOfferSkus(
    input.creds,
    cartItems.map((item) => item.article)
  )
  for (const item of cartItems) {
    item.sku =
      skus.get(item.article) ??
      (Number.isFinite(Number(item.article)) && Number(item.article) > 0
        ? Number(item.article)
        : null)
  }
  const checkoutBody: Record<string, unknown> = {
    buyer_phone: contacts.phone,
    delivery_type: {
      pick_up: { map_point_id: mapPointId },
    },
    items: ozonCheckoutItems(
      cartItems.map((item) => ({
        article: item.article,
        quantity: item.quantity,
        sku: item.sku,
      }))
    ),
  }
  const sent: OzonRequestDump[] = []
  const checkoutItems = checkoutBody.items as unknown[]
  if (!Array.isArray(checkoutItems) || !checkoutItems.length) {
    const labels = input.items
      .map((item) => item.article || item.name)
      .filter(Boolean)
      .join(", ")
    throw withOzonRequests(
      new MedusaError(
        MedusaError.Types.INVALID_DATA,
        labels
          ? `Ozon: нет sku/offer_id у позиций (${labels})`
          : "Ozon: в заказе нет артикулов sku/offer_id"
      ),
      [dumpOzonRequest("/v2/delivery/checkout", checkoutBody)]
    )
  }
  const schemas = ["FBS", "FBO"]
  let splits: ReturnType<typeof ozonOrderCreateSplits> | null = null
  let schema = "FBS"
  const errors: string[] = []
  for (const next of schemas) {
    const checkoutRequest = {
      ...checkoutBody,
      delivery_schema: next,
    }
    sent.push(dumpOzonRequest("/v2/delivery/checkout", checkoutRequest))
    try {
      const checkout = await sellerPost(
        input.creds,
        "/v2/delivery/checkout",
        checkoutRequest
      )
      splits = ozonOrderCreateSplits(checkout, {
        items: cartItems,
        fromPlaceId: input.creds.fromPlaceId,
      })
      const checkoutRec = asRecord(checkout)
      const firstSplit = Array.isArray(checkoutRec?.splits)
        ? asRecord(checkoutRec.splits[0])
        : null
      schema = ozonCreateSchema(
        firstText(firstSplit?.delivery_schema, checkoutRec?.delivery_schema),
        next
      )
      break
    } catch (error) {
      errors.push(
        `${next}: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }
  if (!splits) {
    throw withOzonRequests(
      new MedusaError(
        MedusaError.Types.UNEXPECTED_STATE,
        errors.join("; ") ||
          "Не удалось создать отправление Ozon. Попробуйте ещё раз."
      ),
      sent
    )
  }
  const createRequest = {
    buyer: contacts.buyer,
    recipient: contacts.recipient,
    delivery: {
      pick_up: { map_point_id: mapPointId },
    },
    delivery_schema: schema,
    splits,
  }
  sent.push(dumpOzonRequest("/v2/order/create", createRequest))
  try {
    const created = await sellerPost(
      input.creds,
      "/v2/order/create",
      createRequest
    )
    return { json: created, requests: sent }
  } catch (error) {
    const wrapped =
      error instanceof Error ? error : new Error(String(error))
    throw withOzonRequests(wrapped, sent)
  }
}

export async function createOzonDeliveryOrder(input: {
  creds: OzonCreds
  orderNumber: string
  buyer: { name: string; phone: string; email?: string }
  point: { id: string; address: string }
  amount: number
  items: Array<{ article: string; name: string; quantity: number; price: number }>
}) {
  const { json, requests } = await createSellerOrder(input)
  const ids = await completeOzonCreateIds(input.creds, json)
  const rec = asRecord(json) || {}
  return {
    ...rec,
    order_number: ids.orderNumber || rec.order_number,
    posting_number: ids.postingNumber || rec.posting_number,
    postings: ids.postingNumber
      ? [ids.postingNumber]
      : rec.postings,
    ozon_requests: requests,
  }
}
