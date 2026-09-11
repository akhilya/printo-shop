import { isShopNumber, randomShopNumber } from "../shop-order-number"
import { customerOrderStatus } from "../shop-order-view"
import { shopOrderUrl } from "../custom-order"

describe("randomShopNumber", () => {
  it("returns ten digits that do not start with zero", () => {
    const number = randomShopNumber()
    expect(isShopNumber(number)).toBe(true)
    expect(number.startsWith("0")).toBe(false)
  })
})

describe("shopOrderUrl", () => {
  it("builds a storefront order url", () => {
    expect(
      shopOrderUrl("1234567890", { STORE_CORS: "https://printo.studio" })
    ).toBe("https://printo.studio/order/1234567890")
    expect(shopOrderUrl("12")).toBeNull()
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
  })
})
