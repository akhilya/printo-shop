import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { ensureGiftCardPromotion, newGiftCardCode } from "../gift-card"

describe("newGiftCardCode", () => {
  it("creates uppercase, unguessable-looking single-use codes", () => {
    const code = newGiftCardCode()
    expect(code).toMatch(/^GIFT-[A-F0-9]{32}$/)
    expect(newGiftCardCode()).not.toBe(code)
  })

  it("returns the same private code for payment retries of one order", () => {
    const first = newGiftCardCode("order-123", "server-secret")
    expect(first).toMatch(/^GIFT-[A-F0-9]{32}$/)
    expect(newGiftCardCode("order-123", "server-secret")).toBe(first)
    expect(newGiftCardCode("order-456", "server-secret")).not.toBe(first)
  })
})

describe("ensureGiftCardPromotion", () => {
  it("creates a fixed, single-use promotion that covers the order", async () => {
    const createPromotions = jest.fn().mockResolvedValue([])
    const query = { graph: jest.fn().mockResolvedValue({ data: [] }) }
    const container = {
      resolve: (key: string) =>
        key === ContainerRegistrationKeys.QUERY
          ? query
          : key === Modules.PROMOTION
            ? { createPromotions }
            : null,
    }

    await ensureGiftCardPromotion(container, "GIFT-TEST", 3000)

    expect(createPromotions).toHaveBeenCalledWith([
      expect.objectContaining({
        code: "GIFT-TEST",
        limit: 1,
        metadata: { gift_card: true, gift_card_amount: 3000 },
        application_method: expect.objectContaining({
          type: "fixed",
          value: 3000,
          target_type: "order",
        }),
      }),
    ])
  })

  it("does not recreate the matching promotion on payment retries", async () => {
    const createPromotions = jest.fn()
    const query = {
      graph: jest.fn().mockResolvedValue({
        data: [
          {
            metadata: { gift_card: true },
            application_method: { value: 3000 },
          },
        ],
      }),
    }
    const container = {
      resolve: (key: string) =>
        key === ContainerRegistrationKeys.QUERY
          ? query
          : key === Modules.PROMOTION
            ? { createPromotions }
            : null,
    }

    await ensureGiftCardPromotion(container, "GIFT-TEST", 3000)

    expect(createPromotions).not.toHaveBeenCalled()
  })
})
