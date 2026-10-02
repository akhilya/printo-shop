import { MedusaContainer } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { CUSTOM_ORDER_MODULE } from "../modules/custom-order"
import { SHOP_ANALYTICS_MODULE } from "../modules/shop-analytics"
import {
  orderIsCanceled,
  orderLooksPaid,
} from "./shop-fulfillment-status"

export const ANALYTICS_PERIODS = ["today", "7d", "30d"] as const
export type AnalyticsPeriod = (typeof ANALYTICS_PERIODS)[number]

export const ANALYTICS_ACTIVE_MS = 5 * 60 * 1000
export const ANALYTICS_RETAIN_MS = 90 * 24 * 60 * 60 * 1000

const MOSCOW_OFFSET_MS = 3 * 60 * 60 * 1000
const PAGE_CAP = 100
const SOURCE_CAP = 10
const LIST_PAGE = 500
const LIST_CAP = 20000
const ORDER_PAGE = 100
const ORDER_CAP = 2000

const PATH_LABELS: Record<string, string> = {
  "/": "Главная",
  "/products": "Товары",
  "/collections": "Коллекции",
  "/custom-order": "Индивидуальный заказ",
  "/custom-order/pay": "Оплата индивидуального заказа",
  "/order": "Страница заказа",
  "/checkout": "Оформление",
  "/checkout/success": "Оплата прошла",
  "/checkout/fail": "Оплата не прошла",
  "/delivery": "Доставка",
  "/returns": "Возврат",
  "/offer": "Оферта",
  "/contacts": "Контакты",
  "/privacy": "Конфиденциальность",
}

const CHECKOUT_PATHS = new Set(["/checkout", "/custom-order/pay"])
const PATH_RE = /^\/(?:[\p{L}\p{N}_~.-]+(?:\/[\p{L}\p{N}_~.-]+)*)?$/u
const VISITOR_RE = /^[a-f0-9]{32}$/
const SOURCE_RE = /^[a-z0-9.-]{1,80}$/
const BOT_RE =
  /bot|spider|crawler|\bcrawl|slurp|facebookexternalhit|telegrambot|whatsapp|embedly|skypeuripreview/i

const rateHits = new Map<string, number>()

export type AnalyticsHit = {
  visitor: string
  path: string
  kind: "view" | "beat" | "cart"
  source: string
}

export type AnalyticsOrderInput = {
  created_at: string | Date
  paid: boolean
  canceled: boolean
  custom: boolean
  total: number | null
}

export type AnalyticsViewInput = {
  path: string
  visitor: string
  kind: string
  source?: string | null
  created_at: string | Date
}

export type AnalyticsPageRow = {
  path: string
  label: string
  views: number
  visitors: number
}

export type AnalyticsSourceRow = {
  source: string
  label: string
  views: number
  visitors: number
}

export type AnalyticsSeriesRow = {
  key: string
  label: string
  views: number
  visitors: number
  orders: number
}

export type ShopAnalyticsSummary = {
  period: AnalyticsPeriod
  from: string
  active: number
  views: number
  visitors: number
  carts: number
  checkouts: number
  orders: number
  paid: number
  custom_orders: number
  custom_paid: number
  revenue: number
  average: number | null
  conversion: number | null
  pages: AnalyticsPageRow[]
  sources: AnalyticsSourceRow[]
  series: AnalyticsSeriesRow[]
  truncated: boolean
}

type AnalyticsService = {
  listShopVisitors: (
    filters: object,
    config?: object
  ) => Promise<Array<Record<string, unknown>>>
  listAndCountShopVisitors: (
    filters: object,
    config?: object
  ) => Promise<[unknown[], number]>
  createShopVisitors: (data: object) => Promise<unknown>
  updateShopVisitors: (data: object) => Promise<unknown>
  listShopPageViews: (
    filters: object,
    config?: object
  ) => Promise<Array<Record<string, unknown>>>
  createShopPageViews: (data: object) => Promise<unknown>
  deleteShopPageViews: (ids: string[]) => Promise<unknown>
  deleteShopVisitors: (ids: string[]) => Promise<unknown>
}

export function resetAnalyticsRateLimit() {
  rateHits.clear()
}

export function parseAnalyticsPeriod(value: unknown): AnalyticsPeriod {
  return value === "7d" || value === "30d" ? value : "today"
}

export function moscowDayKey(date: Date) {
  return new Date(date.getTime() + MOSCOW_OFFSET_MS).toISOString().slice(0, 10)
}

export function periodStart(period: AnalyticsPeriod, now: Date) {
  const start = new Date(`${moscowDayKey(now)}T00:00:00+03:00`)
  if (period === "today") return start
  const days = period === "7d" ? 6 : 29
  return new Date(start.getTime() - days * 24 * 60 * 60 * 1000)
}

export function normalizeAnalyticsPath(raw: unknown) {
  let path = String(raw || "").trim()
  if (!path.startsWith("/")) return null
  path = path.split("?")[0].split("#")[0]
  try {
    path = decodeURIComponent(path)
  } catch {
    return null
  }
  if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1)
  if (path.includes("..") || path.includes("//")) return null
  if (!PATH_RE.test(path)) return null
  if (path.startsWith("/order/")) path = "/order"
  if (path.startsWith("/custom-order/pay")) path = "/custom-order/pay"
  return path.slice(0, 180)
}

export function analyticsPathLabel(path: string) {
  if (PATH_LABELS[path]) return PATH_LABELS[path]
  if (path.startsWith("/p/")) {
    const handle = path.slice(3)
    return handle ? `Товар ${handle}` : "Товар"
  }
  if (path.startsWith("/collections/")) return "Коллекция"
  if (path.startsWith("/a/")) {
    const slug = path.slice(3)
    return slug ? `Акция ${slug}` : "Акция"
  }
  return path
}

export function isAnalyticsBot(userAgent: string) {
  return BOT_RE.test(userAgent)
}

function cleanSource(raw: unknown) {
  const source = String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/^www\./, "")
    .slice(0, 80)
  if (!source) return ""
  return SOURCE_RE.test(source) ? source : ""
}

export function parseAnalyticsHit(
  body: unknown,
  userAgent = ""
): AnalyticsHit | null {
  if (isAnalyticsBot(userAgent)) return null
  const rec =
    body && typeof body === "object" ? (body as Record<string, unknown>) : {}
  const visitor = String(rec.visitor || "").trim().toLowerCase()
  if (!VISITOR_RE.test(visitor)) return null
  const kind =
    rec.kind === "beat" || rec.kind === "cart" || rec.kind === "view"
      ? rec.kind
      : null
  if (!kind) return null
  const path = normalizeAnalyticsPath(rec.path)
  if (!path) return null
  return {
    visitor,
    path,
    kind,
    source: kind === "view" ? cleanSource(rec.source) : "",
  }
}

export function analyticsHitAllowed(
  visitor: string,
  kind: AnalyticsHit["kind"],
  path = "/",
  now = Date.now()
) {
  const gap = kind === "beat" ? 20_000 : kind === "view" ? 800 : 50
  const key = kind === "view" ? `view:${visitor}:${path}` : `${kind}:${visitor}`
  const prev = rateHits.get(key) || 0
  if (now - prev < gap) return false
  rateHits.set(key, now)
  if (rateHits.size > 8000) {
    const cutoff = now - 60_000
    for (const [hitKey, at] of rateHits) {
      if (at < cutoff) rateHits.delete(hitKey)
    }
  }
  return true
}

function money(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (value && typeof value === "object") {
    const rec = value as { numeric?: unknown; value?: unknown }
    if (typeof rec.numeric === "number" && Number.isFinite(rec.numeric)) {
      return rec.numeric
    }
    const fromValue = Number(rec.value)
    if (Number.isFinite(fromValue)) return fromValue
  }
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

function atTime(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function dayLabel(key: string) {
  const [, month, day] = key.split("-")
  return `${day}.${month}`
}

function hourLabel(hour: number) {
  return String(hour).padStart(2, "0")
}

function emptySeries(period: AnalyticsPeriod, now: Date) {
  const start = periodStart(period, now)
  if (period === "today") {
    return Array.from({ length: 24 }, (_, hour) => ({
      key: String(hour),
      label: hourLabel(hour),
      views: 0,
      visitors: 0,
      orders: 0,
    }))
  }
  const rows: AnalyticsSeriesRow[] = []
  const endKey = moscowDayKey(now)
  for (
    let cursor = start.getTime();
    cursor <= now.getTime();
    cursor += 24 * 60 * 60 * 1000
  ) {
    const key = moscowDayKey(new Date(cursor))
    rows.push({ key, label: dayLabel(key), views: 0, visitors: 0, orders: 0 })
    if (key === endKey) break
  }
  return rows
}

export function summarizeShopAnalytics(input: {
  now: Date
  period: AnalyticsPeriod
  active: number
  views: AnalyticsViewInput[]
  orders: AnalyticsOrderInput[]
  truncated?: boolean
}): ShopAnalyticsSummary {
  const from = periodStart(input.period, input.now)
  const series = emptySeries(input.period, input.now)
  const seriesByKey = new Map(series.map((row) => [row.key, row]))
  const seriesVisitors = new Map<string, Set<string>>()
  const pageViews = new Map<string, { views: number; visitors: Set<string> }>()
  const sources = new Map<string, { views: number; visitors: Set<string> }>()
  const visitors = new Set<string>()
  let views = 0
  let carts = 0
  let checkouts = 0

  for (const row of input.views) {
    const at = atTime(row.created_at)
    if (!at || at < from || at > input.now) continue
    const path = normalizeAnalyticsPath(row.path)
    if (!path) continue
    const visitor = String(row.visitor || "")
    const kind = row.kind === "cart" ? "cart" : "view"
    const bucketKey =
      input.period === "today"
        ? String(new Date(at.getTime() + MOSCOW_OFFSET_MS).getUTCHours())
        : moscowDayKey(at)
    if (kind === "cart") {
      carts += 1
      continue
    }
    views += 1
    if (visitor) visitors.add(visitor)
    if (CHECKOUT_PATHS.has(path)) checkouts += 1
    const page = pageViews.get(path) || { views: 0, visitors: new Set<string>() }
    page.views += 1
    if (visitor) page.visitors.add(visitor)
    pageViews.set(path, page)
    const source = cleanSource(row.source)
    const sourceRow = sources.get(source) || {
      views: 0,
      visitors: new Set<string>(),
    }
    sourceRow.views += 1
    if (visitor) sourceRow.visitors.add(visitor)
    sources.set(source, sourceRow)
    const bucket = seriesByKey.get(bucketKey)
    if (bucket) {
      bucket.views += 1
      if (visitor) {
        const set = seriesVisitors.get(bucketKey) || new Set<string>()
        set.add(visitor)
        seriesVisitors.set(bucketKey, set)
        bucket.visitors = set.size
      }
    }
  }

  let orders = 0
  let paid = 0
  let paidWithAmount = 0
  let customOrders = 0
  let customPaid = 0
  let revenue = 0
  for (const row of input.orders) {
    const at = atTime(row.created_at)
    if (!at || at < from || at > input.now) continue
    if (!row.custom && row.canceled) continue
    const bucketKey =
      input.period === "today"
        ? String(new Date(at.getTime() + MOSCOW_OFFSET_MS).getUTCHours())
        : moscowDayKey(at)
    const bucket = seriesByKey.get(bucketKey)
    if (row.custom) {
      customOrders += 1
      if (row.paid) {
        customPaid += 1
        paid += 1
        if (row.total != null) {
          revenue += row.total
          paidWithAmount += 1
        }
      }
      continue
    }
    orders += 1
    if (bucket) bucket.orders += 1
    if (row.paid) {
      paid += 1
      if (row.total != null) {
        revenue += row.total
        paidWithAmount += 1
      }
    }
  }

  const pages = [...pageViews.entries()]
    .map(([path, row]) => ({
      path,
      label: analyticsPathLabel(path),
      views: row.views,
      visitors: row.visitors.size,
    }))
    .sort((a, b) => b.views - a.views || a.path.localeCompare(b.path))
    .slice(0, PAGE_CAP)

  const sourceRows = [...sources.entries()]
    .map(([source, row]) => ({
      source,
      label: source || "Прямой заход",
      views: row.views,
      visitors: row.visitors.size,
    }))
    .sort((a, b) => b.views - a.views || a.label.localeCompare(b.label, "ru"))
    .slice(0, SOURCE_CAP)

  return {
    period: input.period,
    from: from.toISOString(),
    active: Number.isFinite(input.active) ? Math.max(0, input.active) : 0,
    views,
    visitors: visitors.size,
    carts,
    checkouts,
    orders,
    paid,
    custom_orders: customOrders,
    custom_paid: customPaid,
    revenue,
    average: paidWithAmount ? revenue / paidWithAmount : null,
    conversion: visitors.size ? paid / visitors.size : null,
    pages,
    sources: sourceRows,
    series,
    truncated: Boolean(input.truncated),
  }
}

function analyticsService(container: MedusaContainer) {
  return container.resolve(SHOP_ANALYTICS_MODULE) as AnalyticsService
}

export async function recordShopAnalyticsHit(
  container: MedusaContainer,
  hit: AnalyticsHit
) {
  const service = analyticsService(container)
  const now = new Date()
  const [existing] = await service.listShopVisitors(
    { visitor: hit.visitor },
    { take: 1 }
  )
  if (existing?.id) {
    await service.updateShopVisitors({
      id: String(existing.id),
      last_seen: now,
    })
  } else {
    try {
      await service.createShopVisitors({
        visitor: hit.visitor,
        last_seen: now,
      })
    } catch {
      const [again] = await service.listShopVisitors(
        { visitor: hit.visitor },
        { take: 1 }
      )
      if (again?.id) {
        await service.updateShopVisitors({
          id: String(again.id),
          last_seen: now,
        })
      }
    }
  }
  if (hit.kind === "beat") return
  await service.createShopPageViews({
    path: hit.path,
    visitor: hit.visitor,
    kind: hit.kind,
    source: hit.source || null,
  })
}

async function listViewsSince(service: AnalyticsService, from: Date) {
  const rows: Array<Record<string, unknown>> = []
  for (let skip = 0; skip < LIST_CAP; skip += LIST_PAGE) {
    const batch = await service.listShopPageViews(
      { created_at: { $gte: from } },
      {
        skip,
        take: LIST_PAGE,
        select: ["path", "visitor", "kind", "source", "created_at"],
        order: { created_at: "ASC" },
      }
    )
    rows.push(...batch)
    if (batch.length < LIST_PAGE) {
      return { rows, truncated: false }
    }
  }
  return { rows, truncated: true }
}

async function listCatalogOrders(container: MedusaContainer, from: Date) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY) as {
    graph: (args: {
      entity: string
      fields: string[]
      pagination?: {
        skip: number
        take: number
        order?: Record<string, string>
      }
    }) => Promise<{ data?: Array<Record<string, unknown>> }>
  }
  const rows: AnalyticsOrderInput[] = []
  for (let skip = 0; skip < ORDER_CAP; skip += ORDER_PAGE) {
    const { data } = await query.graph({
      entity: "order",
      fields: [
        "id",
        "status",
        "total",
        "created_at",
        "canceled_at",
        "payment_status",
        "summary",
        "metadata",
        "payment_collections.status",
        "payment_collections.payments.captured_at",
        "payment_collections.payments.captures.id",
      ],
      pagination: {
        skip,
        take: ORDER_PAGE,
        order: { created_at: "DESC" },
      },
    })
    const batch = data || []
    let older = false
    for (const order of batch) {
      const created = atTime(String(order.created_at || ""))
      if (!created) continue
      if (created < from) {
        older = true
        continue
      }
      const summary = (order.summary || {}) as Record<string, unknown>
      rows.push({
        created_at: created,
        paid: orderLooksPaid(order),
        canceled: orderIsCanceled(order),
        custom: false,
        total: money(
          summary.current_order_total ?? summary.original_order_total ?? order.total
        ),
      })
    }
    if (older || batch.length < ORDER_PAGE) break
  }
  return rows
}

async function listCustomOrderRows(container: MedusaContainer, from: Date) {
  const service = container.resolve(CUSTOM_ORDER_MODULE) as {
    listCustomOrders: (
      filters: object,
      config: object
    ) => Promise<Array<Record<string, unknown>>>
  }
  const rows: AnalyticsOrderInput[] = []
  for (let skip = 0; skip < ORDER_CAP; skip += ORDER_PAGE) {
    const batch = await service.listCustomOrders(
      {},
      {
        skip,
        take: ORDER_PAGE,
        select: ["id", "status", "quote_amount", "paid_at", "created_at"],
        order: { created_at: "DESC" },
      }
    )
    let older = false
    for (const row of batch) {
      const created = atTime(String(row.created_at || ""))
      if (!created) continue
      if (created < from) {
        older = true
        continue
      }
      const paid = Boolean(row.paid_at) || String(row.status || "") === "paid"
      rows.push({
        created_at: created,
        paid,
        canceled: false,
        custom: true,
        total: paid ? money(row.quote_amount) : null,
      })
    }
    if (older || batch.length < ORDER_PAGE) break
  }
  return rows
}

export async function loadShopAnalytics(
  container: MedusaContainer,
  period: AnalyticsPeriod,
  now = new Date()
) {
  const from = periodStart(period, now)
  const service = analyticsService(container)
  const [, active] = await service.listAndCountShopVisitors(
    { last_seen: { $gte: new Date(now.getTime() - ANALYTICS_ACTIVE_MS) } },
    { take: 1 }
  )
  const listed = await listViewsSince(service, from)
  let orders: AnalyticsOrderInput[] = []
  let ordersError = false
  try {
    const [catalog, custom] = await Promise.all([
      listCatalogOrders(container, from),
      listCustomOrderRows(container, from),
    ])
    orders = [...catalog, ...custom]
  } catch {
    ordersError = true
  }
  return {
    ...summarizeShopAnalytics({
      now,
      period,
      active: Number(active) || 0,
      views: listed.rows.map((row) => ({
        path: String(row.path || ""),
        visitor: String(row.visitor || ""),
        kind: String(row.kind || "view"),
        source: row.source ? String(row.source) : "",
        created_at: String(row.created_at || ""),
      })),
      orders,
      truncated: listed.truncated,
    }),
    orders_error: ordersError,
  }
}

export async function pruneShopAnalytics(
  container: MedusaContainer,
  now = new Date()
) {
  const service = analyticsService(container)
  const cutoff = new Date(now.getTime() - ANALYTICS_RETAIN_MS)
  await pruneRows(
    () =>
      service.listShopPageViews(
        { created_at: { $lt: cutoff } },
        { take: 200, select: ["id"] }
      ),
    (ids) => service.deleteShopPageViews(ids)
  )
  await pruneRows(
    () =>
      service.listShopVisitors(
        { last_seen: { $lt: cutoff } },
        { take: 200, select: ["id"] }
      ),
    (ids) => service.deleteShopVisitors(ids)
  )
}

async function pruneRows(
  list: () => Promise<Array<Record<string, unknown>>>,
  remove: (ids: string[]) => Promise<unknown>
) {
  for (let round = 0; round < 50; round += 1) {
    const rows = await list()
    const ids = rows.map((row) => String(row.id || "")).filter(Boolean)
    if (!ids.length) return
    await remove(ids)
    if (ids.length < 200) return
  }
}
