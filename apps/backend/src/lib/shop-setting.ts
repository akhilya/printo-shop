import { MedusaContainer } from "@medusajs/framework"
import { SHOP_SETTING_MODULE } from "../modules/shop-setting"
import type ShopSettingModuleService from "../modules/shop-setting/service"

export const SHOP_SETTING_KEY = "storefront"
export const DEFAULT_CLOSED_MESSAGE = "Магазин в разработке."
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
  const api = String(env.MEDUSA_BACKEND_URL || "http://localhost:9000").replace(
    /\/$/,
    ""
  )
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

let cachedRow: Record<string, unknown> | null = null

function text(row: Record<string, unknown>, key: string): string {
  return String(row[key] || "").trim()
}

export function cacheShopSetting(row: Record<string, unknown> | null) {
  cachedRow = row
}

export function peekShopSetting(): Record<string, unknown> | null {
  return cachedRow
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
  return {
    terminalKey,
    password,
    apiUrl: text(row, "tbank_api_url") || DEFAULT_TBANK_API,
    successUrl: text(row, "tbank_success_url") || urls.successUrl,
    failUrl: text(row, "tbank_fail_url") || urls.failUrl,
    notificationUrl: text(row, "tbank_notification_url") || urls.notificationUrl,
    payType,
    receipt: row.tbank_receipt === true,
    taxation: asTaxation(text(row, "tbank_taxation")),
    vat: asVat(text(row, "tbank_vat")),
  }
}

export function presentShopSetting(
  row: Record<string, unknown>,
  opts: { admin?: boolean } = {}
) {
  const base = {
    id: String(row.id || ""),
    closed: row.closed === true,
    message: text(row, "message") || DEFAULT_CLOSED_MESSAGE,
  }
  if (!opts.admin) return base
  const urls = defaultTbankUrls()
  return {
    ...base,
    tbank_terminal_key: text(row, "tbank_terminal_key"),
    tbank_password_set: Boolean(text(row, "tbank_password")),
    tbank_api_url: text(row, "tbank_api_url") || DEFAULT_TBANK_API,
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
  const update: Record<string, unknown> = {
    closed: rec.closed === true,
    message: message || DEFAULT_CLOSED_MESSAGE,
  }
  if ("tbank_terminal_key" in rec) {
    update.tbank_terminal_key = String(rec.tbank_terminal_key || "").trim() || null
  }
  if ("tbank_password" in rec) {
    const password = String(rec.tbank_password || "").trim()
    if (password) update.tbank_password = password
  }
  if ("tbank_api_url" in rec) {
    update.tbank_api_url = String(rec.tbank_api_url || "").trim() || null
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
  return update
}

export async function getShopSetting(container: MedusaContainer) {
  const service: ShopSettingModuleService = container.resolve(SHOP_SETTING_MODULE)
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
    tbank_terminal_key: process.env.TBANK_TERMINAL_KEY || null,
    tbank_password: process.env.TBANK_PASSWORD || null,
    tbank_api_url: process.env.TBANK_API_URL || null,
    tbank_success_url: process.env.TBANK_SUCCESS_URL || null,
    tbank_fail_url: process.env.TBANK_FAIL_URL || null,
    tbank_notification_url: process.env.TBANK_NOTIFICATION_URL || null,
    tbank_pay_type: process.env.TBANK_PAY_TYPE === "T" ? "T" : "O",
  })
  const row = (Array.isArray(created) ? created[0] : created) as unknown as Record<
    string,
    unknown
  >
  cacheShopSetting(row)
  return Array.isArray(created) ? created[0] : created
}
