import { MedusaError } from "@medusajs/framework/utils"
import {
  assertTbankPaidState,
  isTbankPaidStatus,
  tbankPaymentId,
  tbankSessionFromCart,
} from "../tbank-paid"

describe("isTbankPaidStatus", () => {
  it("accepts only captured or held funds", () => {
    expect(isTbankPaidStatus("CONFIRMED")).toBe(true)
    expect(isTbankPaidStatus("AUTHORIZED")).toBe(true)
    expect(isTbankPaidStatus("NEW")).toBe(false)
    expect(isTbankPaidStatus("FORM_SHOWED")).toBe(false)
    expect(isTbankPaidStatus("REJECTED")).toBe(false)
  })
})

describe("assertTbankPaidState", () => {
  it("rejects unpaid bank statuses", () => {
    expect(() => assertTbankPaidState({ Status: "NEW", Amount: 162858 }, 162858)).toThrow(
      MedusaError
    )
    expect(() =>
      assertTbankPaidState({ Status: "FORM_SHOWED", Amount: 162858 }, 162858)
    ).toThrow(/не подтверждена/)
  })

  it("rejects a smaller bank amount", () => {
    expect(() =>
      assertTbankPaidState({ Status: "CONFIRMED", Amount: 100 }, 162858)
    ).toThrow(/меньше заказа/)
  })

  it("accepts a confirmed payment of the cart total", () => {
    expect(
      assertTbankPaidState({ Status: "CONFIRMED", Amount: 162858 }, 162858)
    ).toMatchObject({ Status: "CONFIRMED" })
  })
})

describe("tbankSessionFromCart", () => {
  it("reads the tbank payment id from the cart session", () => {
    const session = tbankSessionFromCart({
      payment_collection: {
        payment_sessions: [
          {
            provider_id: "pp_tbank_tbank",
            data: { PaymentId: "7001" },
          },
        ],
      },
    })
    expect(tbankPaymentId(session?.data as Record<string, unknown>)).toBe("7001")
  })
})
