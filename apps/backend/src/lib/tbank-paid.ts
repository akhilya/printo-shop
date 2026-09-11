import { MedusaError } from "@medusajs/framework/utils"
import type { TbankApiResponse } from "../modules/tbank/client"
import { TbankClient } from "../modules/tbank/client"
import { mapTbankStatus, toKopecks } from "../modules/tbank/status"
import { tbankOptionsFromRow } from "./shop-setting"

export function tbankPaymentId(data: Record<string, unknown> | null | undefined) {
  const id = data?.PaymentId ?? data?.id
  if (id == null || id === "") return null
  return id as string | number
}

export function isTbankPaidStatus(status?: string | null) {
  const mapped = mapTbankStatus(status)
  return mapped === "captured" || mapped === "authorized"
}

export function assertTbankPaidState(
  state: Pick<TbankApiResponse, "Status" | "Amount">,
  expectedKopecks: number
) {
  if (!isTbankPaidStatus(state.Status)) {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "Оплата не подтверждена банком"
    )
  }
  const paid = Number(state.Amount)
  if (
    Number.isFinite(expectedKopecks) &&
    expectedKopecks >= 100 &&
    Number.isFinite(paid) &&
    paid > 0 &&
    paid + 1 < expectedKopecks
  ) {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "Сумма оплаты меньше заказа"
    )
  }
  return state
}

export function tbankSessionFromCart(cart: Record<string, unknown> | null | undefined) {
  const collection = (cart?.payment_collection || {}) as Record<string, unknown>
  const sessions =
    (collection.payment_sessions as Array<Record<string, unknown>> | undefined) ||
    []
  return (
    sessions.find((session) => session.provider_id === "pp_tbank_tbank") ||
    sessions[0] ||
    null
  )
}

export async function assertCartPaidAtTbank(input: {
  cart: Record<string, unknown>
  row: Record<string, unknown> | null
}) {
  const options = tbankOptionsFromRow(input.row)
  if (!options) {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "Оплата не настроена"
    )
  }
  const session = tbankSessionFromCart(input.cart)
  const data = (session?.data || {}) as Record<string, unknown>
  const paymentId = tbankPaymentId(data)
  if (!paymentId) {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "Оплата не найдена"
    )
  }
  const expected = toKopecks(
    session?.raw_amount ?? session?.amount ?? input.cart.total
  )
  const client = new TbankClient({
    terminalKey: options.terminalKey,
    password: options.password,
    apiUrl: options.apiUrl,
  })
  const state = await client.getState(paymentId)
  return assertTbankPaidState(state, expected)
}
