import {
  ContainerRegistrationKeys,
  MedusaError,
  Modules,
} from "@medusajs/framework/utils"
import { createHmac, randomBytes } from "node:crypto"

export function newGiftCardCode(orderId?: string, secret?: string) {
  if (orderId && secret) {
    const digest = createHmac("sha256", secret)
      .update(`gift-card:${orderId}`)
      .digest("hex")
      .slice(0, 32)
      .toUpperCase()
    return `GIFT-${digest}`
  }
  return `GIFT-${randomBytes(16).toString("hex").toUpperCase()}`
}

export async function ensureGiftCardPromotion(
  container: { resolve: (key: string) => unknown },
  code: string,
  amount: number
) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY) as {
    graph: (input: Record<string, unknown>) => Promise<{
      data?: Array<Record<string, unknown>>
    }>
  }
  const found = await query.graph({
    entity: "promotion",
    fields: ["id", "code", "metadata", "application_method.value"],
    filters: { code },
  })
  if (found.data?.length) {
    const row = found.data[0]
    const metadata =
      row.metadata && typeof row.metadata === "object"
        ? (row.metadata as Record<string, unknown>)
        : {}
    const method =
      row.application_method && typeof row.application_method === "object"
        ? (row.application_method as Record<string, unknown>)
        : {}
    if (metadata.gift_card === true && Number(method.value) === amount) return
    throw new MedusaError(
      MedusaError.Types.CONFLICT,
      "Gift card promotion code is already in use"
    )
  }

  const promotions = container.resolve(Modules.PROMOTION) as {
    createPromotions: (data: Array<Record<string, unknown>>) => Promise<unknown>
  }
  try {
    await promotions.createPromotions([
      {
        code,
        type: "standard",
        status: "active",
        is_automatic: false,
        limit: 1,
        metadata: { gift_card: true, gift_card_amount: amount },
        application_method: {
          type: "fixed",
          value: amount,
          target_type: "order",
          currency_code: "rub",
          allocation: "across",
        },
      },
    ])
  } catch (error) {
    const raced = await query.graph({
      entity: "promotion",
      fields: ["id", "code", "metadata", "application_method.value"],
      filters: { code },
    })
    const row = raced.data?.[0]
    const metadata =
      row?.metadata && typeof row.metadata === "object"
        ? (row.metadata as Record<string, unknown>)
        : {}
    const method =
      row?.application_method && typeof row.application_method === "object"
        ? (row.application_method as Record<string, unknown>)
        : {}
    if (metadata.gift_card === true && Number(method.value) === amount) return
    throw error
  }
}
