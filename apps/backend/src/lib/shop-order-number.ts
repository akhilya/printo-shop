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

export async function allocateShopNumber(
  container: MedusaContainer,
  source: "order" | "custom",
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
    fields: ["id", "metadata"],
    filters: { id: orderId },
  })
  const order = ((data ?? [])[0] || null) as Record<string, unknown> | null
  if (!order) return null
  const metadata = (order.metadata || {}) as Record<string, unknown>
  const current = String(metadata.shop_number || "")
  if (isShopNumber(current)) return current
  const number = await allocateShopNumber(container, "order", orderId)
  const orderModule = container.resolve(Modules.ORDER) as {
    updateOrders?: (data: unknown) => Promise<unknown>
    update?: (id: string, data: unknown) => Promise<unknown>
  }
  const nextMeta = { ...metadata, shop_number: number }
  if (typeof orderModule.updateOrders === "function") {
    await orderModule.updateOrders({ id: orderId, metadata: nextMeta })
  } else if (typeof orderModule.update === "function") {
    await orderModule.update(orderId, { metadata: nextMeta })
  }
  return number
}

export async function ensureCustomShopNumber(
  container: MedusaContainer,
  order: Record<string, unknown>
) {
  const current = String(order.shop_number || "")
  if (isShopNumber(current)) return current
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
