import { randomBytes } from "node:crypto"
import { MedusaContainer } from "@medusajs/framework"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { CUSTOM_ORDER_MODULE } from "../modules/custom-order"
import type CustomOrderModuleService from "../modules/custom-order/service"

export function randomShopNumber() {
  const buf = randomBytes(5)
  let value = 0n
  for (const byte of buf) value = (value << 8n) + BigInt(byte)
  return String(1_000_000_000 + Number(value % 9_000_000_000n))
}

export function isShopNumber(value: string) {
  return /^\d{10}$/.test(value)
}

export function pickShopNumber(...values: unknown[]) {
  for (const value of values) {
    const text = String(value || "").trim()
    if (isShopNumber(text)) return text
  }
  return null
}

export function cartIdFromOrder(order: Record<string, unknown> | null | undefined) {
  if (!order) return ""
  const cart = order.cart as Record<string, unknown> | undefined
  if (cart?.id) return String(cart.id)
  if (order.cart_id) return String(order.cart_id)
  const metadata = (order.metadata || {}) as Record<string, unknown>
  if (metadata.cart_id) return String(metadata.cart_id)
  const collections =
    (order.payment_collections as Array<Record<string, unknown>>) || []
  for (const collection of collections) {
    const rows = [
      ...(((collection.payment_sessions as Array<Record<string, unknown>>) || [])),
      ...(((collection.payments as Array<Record<string, unknown>>) || [])),
    ]
    for (const row of rows) {
      const data = (row.data || {}) as Record<string, unknown>
      const id = data.cart_id || data.cartId
      if (id) return String(id)
    }
  }
  return ""
}

async function lookupService(container: MedusaContainer) {
  return container.resolve(CUSTOM_ORDER_MODULE) as CustomOrderModuleService
}

export async function findShopOrderLookup(
  container: MedusaContainer,
  number: string
) {
  if (!isShopNumber(number)) return null
  const service = await lookupService(container)
  const [row] = await service.listShopOrderLookups({ number }, { take: 1 })
  return (row || null) as Record<string, unknown> | null
}

export async function bindShopNumber(
  container: MedusaContainer,
  number: string,
  source: "order" | "custom" | "cart",
  refId: string
) {
  if (!isShopNumber(number)) return number
  const service = await lookupService(container)
  const [byNumber] = await service.listShopOrderLookups({ number }, { take: 1 })
  if (byNumber) {
    if (
      String(byNumber.source) !== source ||
      String(byNumber.ref_id) !== refId
    ) {
      await service.updateShopOrderLookups({
        id: String(byNumber.id),
        source,
        ref_id: refId,
      })
    }
    return number
  }
  await service.createShopOrderLookups({ number, source, ref_id: refId })
  return number
}

export async function allocateShopNumber(
  container: MedusaContainer,
  source: "order" | "custom" | "cart",
  refId: string
) {
  const service = await lookupService(container)
  const [existing] = await service.listShopOrderLookups(
    { source, ref_id: refId },
    { take: 1 }
  )
  if (existing?.number) return String(existing.number)
  for (let attempt = 0; attempt < 16; attempt++) {
    const number = randomShopNumber()
    try {
      const created = await service.createShopOrderLookups({
        number,
        source,
        ref_id: refId,
      })
      const row = Array.isArray(created) ? created[0] : created
      return String((row as { number?: string }).number || number)
    } catch {
      // Unique collision, try again.
    }
  }
  throw new Error("Не удалось выдать номер заказа")
}

export async function ensureMedusaShopNumber(
  container: MedusaContainer,
  orderId: string
) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "order",
    fields: [
      "id",
      "metadata",
      "cart.id",
      "cart.metadata",
      "cart_id",
      "payment_collections.payment_sessions.data",
      "payment_collections.payments.data",
    ],
    filters: { id: orderId },
  })
  const order = ((data ?? [])[0] || null) as Record<string, unknown> | null
  if (!order) return null
  const metadata = (order.metadata || {}) as Record<string, unknown>
  const cart = (order.cart || {}) as Record<string, unknown>
  const cartMetadata = (cart.metadata || {}) as Record<string, unknown>
  const cartId = cartIdFromOrder(order)
  let cartLookupNumber = ""
  if (cartId) {
    const service = await lookupService(container)
    const [row] = await service.listShopOrderLookups(
      { source: "cart", ref_id: cartId },
      { take: 1 }
    )
    cartLookupNumber = String(row?.number || "")
    if (!cartMetadata.shop_number) {
      try {
        const { data: carts } = await query.graph({
          entity: "cart",
          fields: ["id", "metadata"],
          filters: { id: cartId },
        })
        const loaded = ((carts ?? [])[0] || null) as Record<string, unknown> | null
        const loadedMeta = (loaded?.metadata || {}) as Record<string, unknown>
        if (loadedMeta.shop_number) {
          cartMetadata.shop_number = loadedMeta.shop_number
        }
      } catch {
        // Cart may already be gone after complete.
      }
    }
  }
  const current = pickShopNumber(
    metadata.shop_number,
    cartMetadata.shop_number,
    cartLookupNumber
  )
  const number =
    current || (await allocateShopNumber(container, "order", orderId))
  await bindShopNumber(container, number, "order", orderId)
  if (String(metadata.shop_number || "") !== number) {
    const orderModule = container.resolve(Modules.ORDER) as {
      updateOrders: (
        id: string,
        data: { metadata: Record<string, unknown> }
      ) => Promise<unknown>
    }
    await orderModule.updateOrders(orderId, {
      metadata: { ...metadata, shop_number: number },
    })
  }
  return number
}

export async function ensureCustomShopNumber(
  container: MedusaContainer,
  order: Record<string, unknown>
) {
  const current = String(order.shop_number || "")
  if (isShopNumber(current)) {
    await bindShopNumber(container, current, "custom", String(order.id))
    return current
  }
  const number = await allocateShopNumber(
    container,
    "custom",
    String(order.id)
  )
  const service = await lookupService(container)
  await service.updateCustomOrders({
    id: String(order.id),
    shop_number: number,
  })
  return number
}
