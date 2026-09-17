import { isShopNumber, pickShopNumber, randomShopNumber } from "../shop-order-number"
import {
  customerOrderStatus,
  presentShopOrderFromMedusa,
  shopOrderCanMessage,
} from "../shop-order-view"
import { shopLogoUrl, shopOrderUrl, shopReturnsUrl } from "../custom-order"

describe("randomShopNumber", () => {
  it("returns ten digits that do not start with zero", () => {
    const number = randomShopNumber()
    expect(isShopNumber(number)).toBe(true)
    expect(number.startsWith("0")).toBe(false)
  })
})

describe("pickShopNumber", () => {
  it("keeps the cart number instead of allocating another", () => {
    expect(pickShopNumber("", "4347820595", "8150052298")).toBe("4347820595")
    expect(pickShopNumber("12", "order_01H")).toBeNull()
  })
})

describe("shopOrderUrl", () => {
  it("builds a storefront order url", () => {
    expect(
      shopOrderUrl("1234567890", { STORE_CORS: "https://printo.studio" })
    ).toBe("https://printo.studio/order/1234567890")
    expect(shopOrderUrl("12")).toBeNull()
    expect(shopReturnsUrl({ STORE_CORS: "https://printo.studio" })).toBe(
      "https://printo.studio/returns"
    )
    expect(shopLogoUrl({ STORE_CORS: "https://printo.studio" })).toBe(
      "https://printo.studio/logo-wide.webp"
    )
  })
})

describe("customerOrderStatus", () => {
  it("maps custom and shop statuses", () => {
    expect(
      customerOrderStatus({ source: "custom", status: "quoted", paid: false })
    ).toEqual({ code: "awaiting_payment", label: "Ожидает оплату" })
    expect(
      customerOrderStatus({
        source: "custom",
        status: "paid",
        paid: true,
        fulfillment: "delivering",
      })
    ).toEqual({ code: "delivering", label: "Доставляется" })
    expect(
      customerOrderStatus({ source: "order", status: "canceled" })
    ).toEqual({ code: "canceled", label: "Отменён" })
    expect(
      customerOrderStatus({ source: "order", status: "pending", paid: true })
    ).toEqual({ code: "packing", label: "В сборке" })
    expect(
      customerOrderStatus({ source: "order", status: "pending", paid: false })
    ).toEqual({ code: "awaiting_payment", label: "Ожидает оплату" })
    expect(
      customerOrderStatus({
        source: "order",
        status: "completed",
        paid: true,
        fulfillment: "awaiting_deliver",
      })
    ).toEqual({ code: "ready_to_ship", label: "Собран" })
    expect(
      customerOrderStatus({
        source: "order",
        status: "completed",
        paid: true,
        fulfillment: "returned",
      })
    ).toEqual({ code: "returned", label: "Возврат" })
    expect(
      customerOrderStatus({
        source: "order",
        status: "canceled",
        paid: true,
        fulfillment: "returned",
      })
    ).toEqual({ code: "returned", label: "Возврат" })
  })

  it("hides the order message form after cancel", () => {
    expect(shopOrderCanMessage("canceled")).toBe(false)
    expect(shopOrderCanMessage("closed")).toBe(false)
    expect(shopOrderCanMessage("packing")).toBe(true)
    expect(
      presentShopOrderFromMedusa(
        {
          status: "canceled",
          metadata: {
            cancel_reason: "Товара нет в наличии",
            cancel_note: "Вернём деньги.",
          },
        },
        "4347820595"
      )
    ).toMatchObject({
      can_message: false,
      cancel_reason: "Товара нет в наличии",
      cancel_note: "Вернём деньги.",
    })
  })
})
