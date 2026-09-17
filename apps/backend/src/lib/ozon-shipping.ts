import { MedusaContainer } from "@medusajs/framework"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import {
  ozonCartArticle,
  ozonCredsFromRow,
  ozonSellerReady,
  quoteOzonDelivery,
} from "./ozon-delivery"
import { getShopSetting, parseOzonFixedAmount, parseOzonQuoteMode } from "./shop-setting"

export type OzonQuoteMode = "ozon" | "fixed"

export { parseOzonFixedAmount, parseOzonQuoteMode }

export function resolveOzonQuoteAmount(input: {
  mode?: unknown
  fixedAmount?: unknown
  quoted?: number | null
}): number | null {
  if (parseOzonQuoteMode(input.mode) === "fixed") {
    return parseOzonFixedAmount(input.fixedAmount)
  }
  const quoted = Number(input.quoted)
  return Number.isFinite(quoted) && quoted > 0 ? quoted : null
}

function money(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (value && typeof value === "object") {
    const rec = value as { numeric?: unknown }
    if (typeof rec.numeric === "number") return rec.numeric
  }
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : 0
}

export async function applyOzonShippingToCart(
  container: MedusaContainer,
  input: {
    cartId: string
    pointId: string
    pointAddress?: string
    lat?: number
    lon?: number
    phone?: string
  }
) {
  const settings = (await getShopSetting(container)) as unknown as Record<
    string,
    unknown
  >
  const creds = ozonCredsFromRow(settings)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "cart",
    fields: [
      "id",
      "email",
      "metadata",
      "shipping_address.phone",
      "items.id",
      "items.title",
      "items.quantity",
      "items.unit_price",
      "items.variant_id",
      "items.variant.sku",
      "items.variant_sku",
      "items.variant.weight",
      "shipping_methods.id",
      "shipping_methods.name",
      "shipping_methods.amount",
    ],
    filters: { id: input.cartId },
  })
  const cart = ((data ?? [])[0] || null) as Record<string, unknown> | null
  if (!cart) {
    return { amount: 0 }
  }
  const items = ((cart.items as Array<Record<string, unknown>>) || []).map(
    (item) => {
      const variant = (item.variant as Record<string, unknown> | undefined) || {}
      return {
        article: ozonCartArticle(item),
        quantity: Number(item.quantity || 1),
        price: money(item.unit_price),
        weight: money(variant.weight),
      }
    }
  )
  let amount: number | null = null
  const quoteMode = parseOzonQuoteMode(settings.ozon_quote_mode)
  if (quoteMode === "fixed") {
    amount = parseOzonFixedAmount(settings.ozon_fixed_amount)
  } else if (!ozonSellerReady(creds)) {
    return { amount: 0 }
  } else {
    try {
      amount = await quoteOzonDelivery({
        creds,
        point: {
          id: input.pointId,
          address: input.pointAddress,
          lat: input.lat,
          lon: input.lon,
        },
        phone:
          input.phone ||
          String((cart.shipping_address as Record<string, unknown> | undefined)?.phone || ""),
        items,
      })
    } catch (error) {
      try {
        const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
        logger.warn(
          `Ozon quote failed (${items
            .map((item) => item.article)
            .filter(Boolean)
            .join(", ") || "no offer_id"}): ${error instanceof Error ? error.message : String(error)}`
        )
      } catch {
        // Quote must still finish even if logging is unavailable.
      }
      amount = null
    }
  }
  amount = resolveOzonQuoteAmount({
    mode: quoteMode,
    fixedAmount: settings.ozon_fixed_amount,
    quoted: amount,
  })
  amount = amount ?? 0

  const cartModule = container.resolve(Modules.CART) as {
    updateCarts?: (data: unknown) => Promise<unknown>
    updateShippingMethods?: (data: unknown) => Promise<unknown>
    addShippingMethods?: (data: unknown) => Promise<unknown>
    createShippingMethods?: (data: unknown) => Promise<unknown>
  }
  const metadata = {
    ...((cart.metadata || {}) as Record<string, unknown>),
    ozon_shipping_amount: amount,
    ozon_point_id: input.pointId,
  }
  if (typeof cartModule.updateCarts === "function") {
    await cartModule.updateCarts({ id: input.cartId, metadata })
  }
  const methods = (cart.shipping_methods as Array<Record<string, unknown>>) || []
  const methodId = methods[0]?.id ? String(methods[0].id) : ""
  if (methodId && typeof cartModule.updateShippingMethods === "function") {
    await cartModule.updateShippingMethods([
      { id: methodId, amount, name: "Ozon Доставка" },
    ])
  } else {
    const { data: options } = await query.graph({
      entity: "shipping_option",
      fields: ["id", "name"],
    })
    const option =
      ((options ?? []) as Array<Record<string, unknown>>).find((row) =>
        String(row.name || "").toLowerCase().includes("ozon")
      ) || ((options ?? [])[0] as Record<string, unknown> | undefined)
    const payload = {
      cart_id: input.cartId,
      name: "Ozon Доставка",
      amount,
      shipping_option_id: option?.id ? String(option.id) : undefined,
    }
    if (typeof cartModule.addShippingMethods === "function") {
      await cartModule.addShippingMethods({ shipping_methods: [payload] })
    } else if (typeof cartModule.createShippingMethods === "function") {
      await cartModule.createShippingMethods(payload)
    }
  }
  return { amount }
}
