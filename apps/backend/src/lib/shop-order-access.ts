import { MedusaContainer } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { CUSTOM_ORDER_MODULE } from "../modules/custom-order"
import type CustomOrderModuleService from "../modules/custom-order/service"
import { normalizeOzonPhone } from "./ozon-delivery"
import {
  ensureShopAccessToken,
  findShopOrderLookup,
} from "./shop-order-number"

type ShopOrderContact = {
  type: "email" | "phone"
  value: string
}

export function normalizeShopOrderContact(value: unknown): ShopOrderContact | null {
  const contact = String(value || "").trim()
  if (!contact || contact.length > 254) return null

  if (contact.includes("@")) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact)) return null
    return { type: "email", value: contact.toLowerCase() }
  }

  if (!/^[+\d\s().-]+$/.test(contact)) return null
  const phone = normalizeOzonPhone(contact)
  return phone ? { type: "phone", value: phone } : null
}

export function shopOrderContactMatches(
  submitted: unknown,
  candidates: unknown[]
) {
  const expected = normalizeShopOrderContact(submitted)
  if (!expected) return false

  return candidates.some((candidate) => {
    const actual = normalizeShopOrderContact(candidate)
    return actual?.type === expected.type && actual.value === expected.value
  })
}

export async function issueShopOrderAccessToken(
  container: MedusaContainer,
  number: string,
  submittedContact: unknown
) {
  if (!normalizeShopOrderContact(submittedContact)) return null

  const lookup = await findShopOrderLookup(container, number)
  if (!lookup) return null

  let contacts: unknown[] = []
  const source = String(lookup.source || "")
  const refId = String(lookup.ref_id || "")

  if (source === "custom") {
    const service: CustomOrderModuleService =
      container.resolve(CUSTOM_ORDER_MODULE)
    try {
      const order = (await service.retrieveCustomOrder(refId)) as unknown as Record<
        string,
        unknown
      >
      contacts = [order.email, order.phone]
    } catch {
      return null
    }
  } else if (source === "order") {
    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const { data } = await query.graph({
      entity: "order",
      fields: [
        "email",
        "metadata",
        "shipping_address.phone",
        "billing_address.phone",
      ],
      filters: { id: refId },
    })
    const order = ((data ?? [])[0] || null) as Record<string, unknown> | null
    if (!order) return null

    const metadata = (order.metadata || {}) as Record<string, unknown>
    const shippingAddress = (order.shipping_address || {}) as Record<
      string,
      unknown
    >
    const billingAddress = (order.billing_address || {}) as Record<
      string,
      unknown
    >
    contacts = [
      order.email,
      shippingAddress.phone,
      billingAddress.phone,
      metadata.phone,
    ]
  } else {
    return null
  }

  if (!shopOrderContactMatches(submittedContact, contacts)) return null
  return ensureShopAccessToken(container, number)
}
