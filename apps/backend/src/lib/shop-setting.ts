import { MedusaContainer } from "@medusajs/framework"
import { SHOP_SETTING_MODULE } from "../modules/shop-setting"
import type ShopSettingModuleService from "../modules/shop-setting/service"
import {
  customOrderChannelsFromRow,
  parseCustomOrderChannels,
  type CustomOrderContactChannel,
} from "./custom-order"
import { publicBackendUrl } from "./public-url"
import { isOzonAccessToken, ozonOAuthRedirectUri, setOzonTokenPersist } from "./ozon-delivery"

export const SHOP_SETTING_KEY = "storefront"
export const DEFAULT_CLOSED_MESSAGE = "Магазин в разработке."
export const DEFAULT_ORDERS_MESSAGE = "Заказы временно недоступны."
export const DEFAULT_TBANK_API = "https://securepay.tinkoff.ru/v2"
export const TBANK_TEST_API = "https://rest-api-test.tinkoff.ru/v2"

function firstOrigin(cors?: string): string {
  const raw = String(cors || "")
    .split(",")[0]
    .trim()
    .replace(/\/$/, "")
  return /^https?:\/\//i.test(raw) ? raw : ""
}

export function defaultTbankUrls(env: NodeJS.ProcessEnv = process.env) {
  const store = firstOrigin(env.STORE_CORS) || "http://localhost:8000"
  const api = publicBackendUrl(undefined, env)
  return {
    successUrl: `${store}/checkout/success`,
    failUrl: `${store}/checkout/fail`,
    notificationUrl: `${api}/hooks/tbank`,
  }
}

export const TBANK_TAXATION = [
  "osn",
  "usn_income",
  "usn_income_outcome",
  "envd",
  "esn",
  "patent",
] as const

export const TBANK_VAT = [
  "none",
  "vat0",
  "vat5",
  "vat7",
  "vat10",
  "vat20",
  "vat22",
] as const

export type TbankTaxation = (typeof TBANK_TAXATION)[number]
export type TbankVat = (typeof TBANK_VAT)[number]

export type TbankLiveOptions = {
  terminalKey: string
  password: string
  apiUrl: string
  successUrl?: string
  failUrl?: string
  notificationUrl?: string
  payType: "O" | "T"
  receipt: boolean
  taxation: TbankTaxation
  vat: TbankVat
}

function asTaxation(value: string): TbankTaxation {
  return TBANK_TAXATION.includes(value as TbankTaxation)
    ? (value as TbankTaxation)
    : "usn_income"
}

function asVat(value: string): TbankVat {
  return TBANK_VAT.includes(value as TbankVat) ? (value as TbankVat) : "none"
}

const SHOP_SETTING_TTL_MS = 30_000
let cachedRow: Record<string, unknown> | null = null
let cachedAt = 0

function text(row: Record<string, unknown>, key: string): string {
  return String(row[key] || "").trim()
}

export function parseGiftCardDenominations(value: unknown): number[] {
  let parsed = value
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value)
    } catch {
      parsed = value.split(/[\s,;]+/)
    }
  }
  if (!Array.isArray(parsed)) return []
  return [...new Set(parsed.map(Number).filter((amount) =>
    Number.isSafeInteger(amount) && amount > 0 && amount <= 1_000_000
  ))].sort((a, b) => a - b)
}

export function cacheShopSetting(row: Record<string, unknown> | null) {
  cachedRow = row
  cachedAt = row ? Date.now() : 0
}

export function peekShopSetting(): Record<string, unknown> | null {
  return cachedRow
}

export function resolveTbankApiUrl(terminalKey: string, configured?: string) {
  const url = String(configured || "").trim() || DEFAULT_TBANK_API
  if (/demo/i.test(terminalKey)) return DEFAULT_TBANK_API
  if (/rest-api-test\.tinkoff\.ru/i.test(url)) return DEFAULT_TBANK_API
  return url.replace(/\/$/, "")
}

export function tbankOptionsFromRow(
  row: Record<string, unknown> | null | undefined
): TbankLiveOptions | null {
  if (!row) return null
  const terminalKey = text(row, "tbank_terminal_key")
  const password = text(row, "tbank_password")
  if (!terminalKey || !password) return null
  const payType = text(row, "tbank_pay_type") === "T" ? "T" : "O"
  const urls = defaultTbankUrls()
  const configured = text(row, "tbank_api_url") || DEFAULT_TBANK_API
  return {
    terminalKey,
    password,
    apiUrl: resolveTbankApiUrl(terminalKey, configured),
    successUrl: text(row, "tbank_success_url") || urls.successUrl,
    failUrl: text(row, "tbank_fail_url") || urls.failUrl,
    notificationUrl: text(row, "tbank_notification_url") || urls.notificationUrl,
    payType,
    receipt: row.tbank_receipt === true,
    taxation: asTaxation(text(row, "tbank_taxation")),
    vat: asVat(text(row, "tbank_vat")),
  }
}

export type OzonQuoteMode = "ozon" | "fixed"

export function parseOzonQuoteMode(value: unknown): OzonQuoteMode {
  return String(value || "").trim() === "fixed" ? "fixed" : "ozon"
}

export function parseOzonFixedAmount(value: unknown): number | null {
  const amount = Math.round(Number(value))
  return Number.isFinite(amount) && amount > 0 ? amount : null
}

export type ShopSettingPublic = {
  id: string
  closed: boolean
  message: string
  orders_closed: boolean
  orders_message: string
  ozon_configured: boolean
  ozon_from_place_id: string
  ozon_quote_mode: OzonQuoteMode
  ozon_fixed_amount: number
  redirect_path: string
  redirect_target: string
  custom_order_channels: CustomOrderContactChannel[]
  gift_card_denominations: number[]
}

export type ShopSettingAdmin = ShopSettingPublic & {
  ozon_client_id: string
  ozon_oauth_token_set: boolean
  ozon_connected: boolean
  ozon_oauth_redirect_uri: string
  ozon_fixed_amount: number
  ozon_custom_article: string
  tbank_terminal_key: string
  tbank_password_set: boolean
  tbank_api_url: string
  tbank_success_url: string
  tbank_fail_url: string
  tbank_notification_url: string
  tbank_pay_type: "O" | "T"
  tbank_receipt: boolean
  tbank_taxation: TbankTaxation
  tbank_vat: TbankVat
}

export function presentShopSetting(
  row: Record<string, unknown>,
  opts: { admin: true }
): ShopSettingAdmin
export function presentShopSetting(
  row: Record<string, unknown>,
  opts?: { admin?: boolean }
): ShopSettingPublic | ShopSettingAdmin
export function presentShopSetting(
  row: Record<string, unknown>,
  opts: { admin?: boolean } = {}
): ShopSettingPublic | ShopSettingAdmin {
  const base = {
    id: String(row.id || ""),
    closed: row.closed === true,
    message: text(row, "message") || DEFAULT_CLOSED_MESSAGE,
    orders_closed: row.orders_closed === true,
    orders_message: text(row, "orders_message") || DEFAULT_ORDERS_MESSAGE,
    ozon_configured: Boolean(
      text(row, "ozon_refresh_token") ||
        isOzonAccessToken(text(row, "ozon_oauth_token"))
    ),
    ozon_from_place_id: text(row, "ozon_from_place_id"),
    ozon_quote_mode: parseOzonQuoteMode(row.ozon_quote_mode),
    ozon_fixed_amount: parseOzonFixedAmount(row.ozon_fixed_amount) || 0,
    redirect_path: text(row, "redirect_path"),
    redirect_target: text(row, "redirect_target"),
    custom_order_channels: customOrderChannelsFromRow(row),
    gift_card_denominations: parseGiftCardDenominations(
      row.gift_card_denominations
    ),
  }
  if (!opts.admin) return base
  const urls = defaultTbankUrls()
  return {
    ...base,
    ozon_client_id: text(row, "ozon_client_id"),
    ozon_oauth_token_set: Boolean(text(row, "ozon_oauth_token")),
    ozon_connected: Boolean(text(row, "ozon_refresh_token")),
    ozon_oauth_redirect_uri: ozonOAuthRedirectUri(),
    ozon_from_place_id: text(row, "ozon_from_place_id"),
    ozon_fixed_amount: parseOzonFixedAmount(row.ozon_fixed_amount) || 0,
    ozon_custom_article: text(row, "ozon_custom_article"),
    tbank_terminal_key: text(row, "tbank_terminal_key"),
    tbank_password_set: Boolean(text(row, "tbank_password")),
    tbank_api_url: resolveTbankApiUrl(
      text(row, "tbank_terminal_key"),
      text(row, "tbank_api_url")
    ),
    tbank_success_url: text(row, "tbank_success_url") || urls.successUrl,
    tbank_fail_url: text(row, "tbank_fail_url") || urls.failUrl,
    tbank_notification_url:
      text(row, "tbank_notification_url") || urls.notificationUrl,
    tbank_pay_type: text(row, "tbank_pay_type") === "T" ? "T" : "O",
    tbank_receipt: row.tbank_receipt === true,
    tbank_taxation: asTaxation(text(row, "tbank_taxation")),
    tbank_vat: asVat(text(row, "tbank_vat")),
  }
}

export function parseShopSettingUpdate(
  body: unknown,
  current: Record<string, unknown>
): Record<string, unknown> {
  const rec =
    body && typeof body === "object" ? (body as Record<string, unknown>) : {}
  const message = String(rec.message ?? current.message ?? "").trim()
  const ordersMessage = String(
    rec.orders_message ?? current.orders_message ?? ""
  ).trim()
  const update: Record<string, unknown> = {
    closed: rec.closed === true,
    message: message || DEFAULT_CLOSED_MESSAGE,
    orders_closed: rec.orders_closed === true,
    orders_message: ordersMessage || DEFAULT_ORDERS_MESSAGE,
  }
  if ("tbank_terminal_key" in rec) {
    update.tbank_terminal_key = String(rec.tbank_terminal_key || "").trim() || null
  }
  if ("tbank_password" in rec) {
    const password = String(rec.tbank_password || "").trim()
    if (password) update.tbank_password = password
  }
  if ("tbank_api_url" in rec) {
    const key = String(
      rec.tbank_terminal_key ?? current.tbank_terminal_key ?? ""
    ).trim()
    update.tbank_api_url = resolveTbankApiUrl(
      key,
      String(rec.tbank_api_url || "").trim()
    )
  }
  if ("tbank_success_url" in rec) {
    update.tbank_success_url = String(rec.tbank_success_url || "").trim() || null
  }
  if ("tbank_fail_url" in rec) {
    update.tbank_fail_url = String(rec.tbank_fail_url || "").trim() || null
  }
  if ("tbank_notification_url" in rec) {
    update.tbank_notification_url =
      String(rec.tbank_notification_url || "").trim() || null
  }
  if ("tbank_pay_type" in rec) {
    update.tbank_pay_type = String(rec.tbank_pay_type) === "T" ? "T" : "O"
  }
  if ("tbank_receipt" in rec) {
    update.tbank_receipt = rec.tbank_receipt === true
  }
  if ("tbank_taxation" in rec) {
    update.tbank_taxation = asTaxation(String(rec.tbank_taxation || ""))
  }
  if ("tbank_vat" in rec) {
    update.tbank_vat = asVat(String(rec.tbank_vat || ""))
  }
  if ("ozon_client_id" in rec) {
    update.ozon_client_id = String(rec.ozon_client_id || "").trim() || null
  }
  if ("ozon_oauth_token" in rec) {
    const token = String(rec.ozon_oauth_token || "").trim()
    if (token) update.ozon_oauth_token = token
  }
  if ("ozon_from_place_id" in rec) {
    update.ozon_from_place_id = String(rec.ozon_from_place_id || "").trim() || null
  }
  if ("ozon_quote_mode" in rec) {
    update.ozon_quote_mode = parseOzonQuoteMode(rec.ozon_quote_mode)
  }
  if ("ozon_fixed_amount" in rec) {
    const amount = parseOzonFixedAmount(rec.ozon_fixed_amount)
    if (amount != null) update.ozon_fixed_amount = amount
  }
  if ("ozon_custom_article" in rec) {
    update.ozon_custom_article =
      String(rec.ozon_custom_article || "").trim() || null
  }
  if ("custom_order_channels" in rec) {
    const channels = parseCustomOrderChannels(rec.custom_order_channels)
    update.custom_order_telegram = channels.telegram
    update.custom_order_max = channels.max
  }
  if ("gift_card_denominations" in rec) {
    update.gift_card_denominations = JSON.stringify(
      parseGiftCardDenominations(rec.gift_card_denominations)
    )
  }
  return update
}

export async function getShopSetting(container: MedusaContainer) {
  const service: ShopSettingModuleService = container.resolve(SHOP_SETTING_MODULE)
  if (cachedRow && Date.now() - cachedAt < SHOP_SETTING_TTL_MS) {
    return cachedRow
  }
  setOzonTokenPersist(async ({ refreshToken }) => {
    const current = peekShopSetting()
    if (!current?.id) return
    const nextToken = String(refreshToken || "").trim() || null
    if (String(current.ozon_refresh_token || "").trim() === String(nextToken || "")) {
      return
    }
    await service.updateShopSettings({
      id: String(current.id),
      ozon_refresh_token: nextToken,
    })
    cacheShopSetting({
      ...current,
      ozon_refresh_token: nextToken,
    })
  })
  const existing = await service.listShopSettings(
    { key: SHOP_SETTING_KEY },
    { take: 1 }
  )
  if (existing[0]) {
    const row = existing[0] as unknown as Record<string, unknown>
    if (!text(row, "tbank_terminal_key") && process.env.TBANK_TERMINAL_KEY) {
      const patched = await service.updateShopSettings({
        id: String(row.id),
        tbank_terminal_key: process.env.TBANK_TERMINAL_KEY || null,
        tbank_password: process.env.TBANK_PASSWORD || null,
        tbank_api_url: process.env.TBANK_API_URL || null,
        tbank_success_url: process.env.TBANK_SUCCESS_URL || null,
        tbank_fail_url: process.env.TBANK_FAIL_URL || null,
        tbank_notification_url: process.env.TBANK_NOTIFICATION_URL || null,
        tbank_pay_type: process.env.TBANK_PAY_TYPE === "T" ? "T" : "O",
      })
      const next = Array.isArray(patched) ? patched[0] : patched
      const merged = {
        ...row,
        ...((next || {}) as Record<string, unknown>),
      }
      cacheShopSetting(merged)
      return merged
    }
    cacheShopSetting(row)
    return existing[0]
  }
  const created = await service.createShopSettings({
    key: SHOP_SETTING_KEY,
    closed: false,
    message: DEFAULT_CLOSED_MESSAGE,
    orders_closed: false,
    orders_message: DEFAULT_ORDERS_MESSAGE,
    tbank_terminal_key: process.env.TBANK_TERMINAL_KEY || null,
    tbank_password: process.env.TBANK_PASSWORD || null,
    tbank_api_url: process.env.TBANK_API_URL || null,
    tbank_success_url: process.env.TBANK_SUCCESS_URL || null,
    tbank_fail_url: process.env.TBANK_FAIL_URL || null,
    tbank_notification_url: process.env.TBANK_NOTIFICATION_URL || null,
    tbank_pay_type: process.env.TBANK_PAY_TYPE === "T" ? "T" : "O",
    ozon_client_id: process.env.OZON_CLIENT_ID || null,
    ozon_oauth_token: process.env.OZON_OAUTH_TOKEN || null,
    ozon_refresh_token: process.env.OZON_REFRESH_TOKEN || null,
    ozon_from_place_id: process.env.OZON_FROM_PLACE_ID || null,
  })
  const row = (Array.isArray(created) ? created[0] : created) as unknown as Record<
    string,
    unknown
  >
  cacheShopSetting(row)
  return Array.isArray(created) ? created[0] : created
}
