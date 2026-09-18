import { createHash, timingSafeEqual } from "crypto"
import { MedusaContainer } from "@medusajs/framework"
import {
  deleteProductsWorkflow,
  deletePromotionsWorkflow,
} from "@medusajs/medusa/core-flows"
import { Modules } from "@medusajs/framework/utils"
import type {
  ICartModuleService,
  IOrderModuleService,
  IProductModuleService,
  IPromotionModuleService,
} from "@medusajs/framework/types"
import { BANNER_MODULE } from "../modules/banner"
import type BannerModuleService from "../modules/banner/service"
import { CUSTOM_ORDER_MODULE } from "../modules/custom-order"
import type CustomOrderModuleService from "../modules/custom-order/service"
import { REVIEW_MODULE } from "../modules/reviews"
import type ReviewModuleService from "../modules/reviews/service"
import { SHOP_EVENT_MODULE } from "../modules/shop-event"
import type ShopEventModuleService from "../modules/shop-event/service"
import { invalidateShopCatalogCache } from "./shop-catalog"
import { recordShopEvent } from "./shop-event"

export const SHOP_DEV_PURGE_TARGETS = [
  "orders",
  "logs",
  "products",
  "rest",
] as const

export type ShopDevPurgeTarget = (typeof SHOP_DEV_PURGE_TARGETS)[number]

export type ShopDevPurgeInput = {
  target: ShopDevPurgeTarget
  password: string
  secret: string
  confirmed: true
}

const MIN_SECRET = 16
const BATCH = 40

function text(value: unknown) {
  return String(value || "").trim()
}

function digest(value: string) {
  return createHash("sha256").update(value, "utf8").digest()
}

export function secretsMatch(given: string, expected: string) {
  if (!expected) return false
  return timingSafeEqual(digest(given), digest(expected))
}

export function shopDevPurgeConfigured(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env
) {
  return text(env.SHOP_DEV_PURGE_SECRET).length >= MIN_SECRET
}

export function parseShopDevPurge(
  body: unknown
): ShopDevPurgeInput | { error: string } {
  const rec =
    body && typeof body === "object" ? (body as Record<string, unknown>) : {}
  const target = text(rec.target)
  const password = String(rec.password || "")
  const secret = String(rec.secret || "")
  const confirmed = rec.confirmed === true
  if (
    !confirmed ||
    !password ||
    !secret ||
    !SHOP_DEV_PURGE_TARGETS.includes(target as ShopDevPurgeTarget)
  ) {
    return { error: "Нужны пароль, секрет и подтверждение" }
  }
  return {
    target: target as ShopDevPurgeTarget,
    password,
    secret,
    confirmed: true,
  }
}

export function confirmShopDevPurgeSecret(
  secret: string,
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env
) {
  if (!shopDevPurgeConfigured(env)) return false
  return secretsMatch(secret, text(env.SHOP_DEV_PURGE_SECRET))
}

export async function verifyLoggedInAdminPassword(options: {
  actorId?: string | null
  password: string
  getEmail: (actorId: string) => Promise<string | null>
  authenticateEmailPass: (email: string, password: string) => Promise<boolean>
}) {
  const actorId = text(options.actorId)
  if (!actorId || !options.password) return false
  try {
    const email = await options.getEmail(actorId)
    if (!email) return false
    return (
      (await options.authenticateEmailPass(email, options.password)) === true
    )
  } catch {
    return false
  }
}

function idsOf(rows: Array<{ id?: string } | string>) {
  return rows
    .map((row) => (typeof row === "string" ? row : String(row.id || "")))
    .filter(Boolean)
}

export async function drainIds(
  list: () => Promise<string[]>,
  remove: (ids: string[]) => Promise<void>,
  maxBatches = 400
) {
  let deleted = 0
  let failed = 0
  let stuck = 0
  for (let i = 0; i < maxBatches; i++) {
    const ids = [...new Set(await list())].filter(Boolean)
    if (!ids.length) break
    const before = deleted
    try {
      await remove(ids)
      deleted += ids.length
    } catch {
      for (const id of ids) {
        try {
          await remove([id])
          deleted += 1
        } catch {
          failed += 1
        }
      }
    }
    if (deleted === before) {
      stuck += 1
      if (stuck >= 2) break
    } else {
      stuck = 0
    }
  }
  return { deleted, failed }
}

async function purgeOrders(container: MedusaContainer) {
  const order: IOrderModuleService = container.resolve(Modules.ORDER)
  const cart: ICartModuleService = container.resolve(Modules.CART)
  const custom: CustomOrderModuleService = container.resolve(CUSTOM_ORDER_MODULE)
  const orders = await drainIds(
    async () =>
      idsOf(await order.listOrders({}, { take: BATCH, select: ["id"] })),
    async (ids) => {
      await order.deleteOrders(ids)
    }
  )
  const carts = await drainIds(
    async () => idsOf(await cart.listCarts({}, { take: BATCH, select: ["id"] })),
    async (ids) => {
      await cart.deleteCarts(ids)
    }
  )
  const customOrders = await drainIds(
    async () => idsOf(await custom.listCustomOrders({}, { take: BATCH })),
    async (ids) => {
      await custom.deleteCustomOrders(ids)
    }
  )
  const lookups = await drainIds(
    async () => idsOf(await custom.listShopOrderLookups({}, { take: BATCH })),
    async (ids) => {
      await custom.deleteShopOrderLookups(ids)
    }
  )
  return {
    orders: orders.deleted,
    carts: carts.deleted,
    custom_orders: customOrders.deleted,
    lookups: lookups.deleted,
    failed:
      orders.failed + carts.failed + customOrders.failed + lookups.failed,
  }
}

async function purgeLogs(container: MedusaContainer) {
  const events: ShopEventModuleService = container.resolve(SHOP_EVENT_MODULE)
  return drainIds(
    async () => idsOf(await events.listShopEvents({}, { take: BATCH })),
    async (ids) => {
      await events.deleteShopEvents(ids)
    }
  )
}

async function purgeProducts(container: MedusaContainer) {
  const product: IProductModuleService = container.resolve(Modules.PRODUCT)
  const inventory = container.resolve(Modules.INVENTORY) as {
    listInventoryItems: (
      filters: Record<string, unknown>,
      config?: Record<string, unknown>
    ) => Promise<Array<{ id?: string }>>
    deleteInventoryItems: (ids: string[]) => Promise<unknown>
  }
  const products = await drainIds(
    async () =>
      idsOf(await product.listProducts({}, { take: BATCH, select: ["id"] })),
    async (ids) => {
      await deleteProductsWorkflow(container).run({ input: { ids } })
    }
  )
  const collections = await drainIds(
    async () =>
      idsOf(
        await product.listProductCollections({}, { take: BATCH, select: ["id"] })
      ),
    async (ids) => {
      await product.deleteProductCollections(ids)
    }
  )
  const categories = await drainIds(
    async () =>
      idsOf(
        await product.listProductCategories({}, { take: BATCH, select: ["id"] })
      ),
    async (ids) => {
      await product.deleteProductCategories(ids)
    }
  )
  const items = await drainIds(
    async () =>
      idsOf(
        await inventory.listInventoryItems({}, { take: BATCH, select: ["id"] })
      ),
    async (ids) => {
      await inventory.deleteInventoryItems(ids)
    }
  )
  invalidateShopCatalogCache()
  return {
    products: products.deleted,
    collections: collections.deleted,
    categories: categories.deleted,
    inventory_items: items.deleted,
    failed:
      products.failed +
      collections.failed +
      categories.failed +
      items.failed,
  }
}

async function purgeRest(container: MedusaContainer) {
  const reviews: ReviewModuleService = container.resolve(REVIEW_MODULE)
  const banners: BannerModuleService = container.resolve(BANNER_MODULE)
  const promotion: IPromotionModuleService = container.resolve(
    Modules.PROMOTION
  )
  const reviewRows = await drainIds(
    async () => idsOf(await reviews.listReviews({}, { take: BATCH })),
    async (ids) => {
      await reviews.deleteReviews(ids)
    }
  )
  const bannerRows = await drainIds(
    async () => idsOf(await banners.listBanners({}, { take: BATCH })),
    async (ids) => {
      await banners.deleteBanners(ids)
    }
  )
  const promoRows = await drainIds(
    async () =>
      idsOf(await promotion.listPromotions({}, { take: BATCH, select: ["id"] })),
    async (ids) => {
      await deletePromotionsWorkflow(container).run({ input: { ids } })
    }
  )
  return {
    reviews: reviewRows.deleted,
    banners: bannerRows.deleted,
    promotions: promoRows.deleted,
    failed: reviewRows.failed + bannerRows.failed + promoRows.failed,
  }
}

let purging = false

export async function runShopDevPurge(
  container: MedusaContainer,
  target: ShopDevPurgeTarget
) {
  if (purging) {
    return { error: "Уже идёт очистка" as const }
  }
  purging = true
  try {
    let deleted: Record<string, number> = {}
    if (target === "orders") deleted = await purgeOrders(container)
    else if (target === "logs") {
      const rows = await purgeLogs(container)
      deleted = { logs: rows.deleted, failed: rows.failed }
    } else if (target === "products") deleted = await purgeProducts(container)
    else deleted = await purgeRest(container)
    if (target !== "logs") {
      await recordShopEvent(container, {
        kind: "dev_purge",
        level: "warn",
        title: "Очистка данных",
        message: `Очистка: ${target}`,
        detail: JSON.stringify(deleted),
      })
    }
    return { target, deleted }
  } finally {
    purging = false
  }
}
