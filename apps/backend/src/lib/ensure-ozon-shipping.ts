import { MedusaContainer } from "@medusajs/framework"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { createShippingOptionsWorkflow } from "@medusajs/medusa/core-flows"

const OPTION_NAME = "Ozon Доставка"

function money(value: unknown) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

export async function ensureOzonShipping(container: MedusaContainer) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const fulfillment = container.resolve(Modules.FULFILLMENT) as {
    updateShippingOptions?: (data: unknown) => Promise<unknown>
    listShippingOptions?: (
      filters?: unknown,
      config?: unknown
    ) => Promise<Array<Record<string, unknown>>>
  }
  const { data: options } = await query.graph({
    entity: "shipping_option",
    fields: ["id", "name", "provider_id", "service_zone_id", "shipping_profile_id"],
  })
  const rows = (options ?? []) as Array<Record<string, unknown>>
  const existing =
    rows.find((row) => String(row.name || "").toLowerCase().includes("ozon")) ||
    rows[0]
  if (existing?.id && typeof fulfillment.updateShippingOptions === "function") {
    await fulfillment.updateShippingOptions({
      id: String(existing.id),
      name: OPTION_NAME,
    })
    await zeroShippingPrices(container, String(existing.id))
    return { id: String(existing.id), name: OPTION_NAME }
  }

  const { data: profiles } = await query.graph({
    entity: "shipping_profile",
    fields: ["id"],
  })
  const { data: zones } = await query.graph({
    entity: "service_zone",
    fields: ["id"],
  })
  const { data: regions } = await query.graph({
    entity: "region",
    fields: ["id", "currency_code"],
  })
  const profileId = String((profiles ?? [])[0]?.id || "")
  const zoneId = String((zones ?? [])[0]?.id || "")
  const region = ((regions ?? [])[0] || {}) as Record<string, unknown>
  if (!profileId || !zoneId) {
    return null
  }
  const prices: Array<Record<string, unknown>> = [
    { currency_code: "rub", amount: 0 },
  ]
  if (region.id) {
    prices.push({ region_id: region.id, amount: 0 })
  }
  await createShippingOptionsWorkflow(container).run({
    input: [
      {
        name: OPTION_NAME,
        price_type: "flat",
        provider_id: "manual_manual",
        service_zone_id: zoneId,
        shipping_profile_id: profileId,
        type: {
          label: OPTION_NAME,
          description: "Доставка Ozon до пункта выдачи. Цена считается по ПВЗ.",
          code: "ozon",
        },
        prices,
        rules: [
          {
            attribute: "enabled_in_store",
            value: "true",
            operator: "eq",
          },
          {
            attribute: "is_return",
            value: "false",
            operator: "eq",
          },
        ],
      },
    ],
  })
  return { name: OPTION_NAME }
}

async function zeroShippingPrices(container: MedusaContainer, optionId: string) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "shipping_option",
    fields: ["id", "prices.id", "prices.amount", "prices.currency_code"],
    filters: { id: optionId },
  })
  const option = ((data ?? [])[0] || null) as Record<string, unknown> | null
  const prices = (option?.prices as Array<Record<string, unknown>>) || []
  const pricing = container.resolve(Modules.PRICING) as {
    updatePrices?: (data: unknown) => Promise<unknown>
  }
  const updates = prices
    .filter((price) => money(price.amount) !== 0 && price.id)
    .map((price) => ({ id: String(price.id), amount: 0 }))
  if (updates.length && typeof pricing.updatePrices === "function") {
    await pricing.updatePrices(updates)
  }
}
