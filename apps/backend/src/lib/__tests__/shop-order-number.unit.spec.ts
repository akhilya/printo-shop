import { isShopNumber, randomShopNumber } from "../shop-order-number"
import { customerOrderStatus } from "../shop-order-view"
import { shopOrderUrl, shopReturnsUrl } from "../custom-order"

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
    expect(shopReturnsUrl({ STORE_CORS: "https://printo.studio" })).toBe(
      "https://printo.studio/returns"
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
})
