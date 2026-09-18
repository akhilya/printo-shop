import { isShopNumber, pickShopNumber, randomShopNumber, shopAccessTokensMatch, shopOrderQueryToken } from "../shop-order-number"
import {
  customerOrderStatus,
  presentShopOrderFromMedusa,
  publicShopOrder,
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

describe("shopAccessTokensMatch", () => {
  it("rejects a missing or different token", () => {
    expect(shopAccessTokensMatch("abc", "abc")).toBe(true)
    expect(shopAccessTokensMatch("abc", "abd")).toBe(false)
    expect(shopAccessTokensMatch("abc", "")).toBe(false)
    expect(shopOrderQueryToken({ t: "abc" })).toBe("abc")
    expect(shopOrderQueryToken({ token: ["xyz"] })).toBe("xyz")
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
    expect(
      shopOrderUrl("1234567890", { STORE_CORS: "https://printo.studio" }, "tok_1")
    ).toBe("https://printo.studio/order/1234567890?t=tok_1")
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
        fulfillment: "delivered",
      })
    ).toEqual({ code: "canceled", label: "Отменён" })
    expect(
      customerOrderStatus({
        source: "order",
        status: "cancelled",
        paid: true,
        fulfillment: "returned",
      })
    ).toEqual({ code: "canceled", label: "Отменён" })
  })

  it("hides the order message form until delivery", () => {
    expect(shopOrderCanMessage("canceled")).toBe(false)
    expect(shopOrderCanMessage("closed")).toBe(false)
    expect(shopOrderCanMessage("packing")).toBe(false)
    expect(shopOrderCanMessage("ready_to_ship")).toBe(false)
    expect(shopOrderCanMessage("delivering")).toBe(false)
    expect(shopOrderCanMessage("delivered")).toBe(true)
    expect(shopOrderCanMessage("returned")).toBe(true)
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
    expect(
      presentShopOrderFromMedusa(
        {
          status: "completed",
          payment_collections: [{ status: "captured" }],
        },
        "4347820595"
      ).can_message
    ).toBe(false)
    expect(
      presentShopOrderFromMedusa(
        {
          status: "archived",
          payment_collections: [{ status: "captured" }],
        },
        "4347820595"
      ).can_message
    ).toBe(true)
  })

  it("sends the paid line total after a promo, not the catalog unit price", () => {
    const presented = presentShopOrderFromMedusa(
      {
        status: "completed",
        payment_collections: [{ status: "captured" }],
        total: 1500,
        shipping_total: { numeric: 300 },
        metadata: { ozon_shipping_amount: 300 },
        items: [
          {
            title: "Фигурка",
            quantity: 2,
            unit_price: 800,
            total: 1200,
            variant: { sku: "FI3" },
          },
        ],
      },
      "4347820595"
    )
    expect(presented.items[0]).toMatchObject({
      quantity: 2,
      unit_price: 600,
      total: 1200,
    })
    expect(presented.shipping).toBe(300)
    expect(presented.total).toBe(1500)
  })

  it("does not put email, address or Ozon ids on the public order page", () => {
    const publicOrder = publicShopOrder(
      presentShopOrderFromMedusa(
        {
          email: "anna@test.ru",
          status: "completed",
          payment_collections: [{ status: "captured" }],
          total: 1500,
          metadata: {
            ozon_order_number: "123-456",
            ozon_posting_number: "123-456-7",
            ozon_tracking: "https://www.ozon.ru/my/orderdetails/?order=123-456",
            ozon_label_url: "https://cdn/label.pdf",
            ozon_point_name: "ПВЗ Тверская",
            ozon_point_address: "Тверская, 1",
          },
          shipping_address: {
            city: "Москва",
            address_1: "Тверская, 1",
            address_2: "ПВЗ Тверская",
          },
          items: [
            {
              title: "Фигурка",
              quantity: 1,
              unit_price: 1500,
              total: 1500,
              variant: { sku: "FI3" },
            },
          ],
        },
        "4347820595"
      )
    )
    expect(publicOrder).toMatchObject({
      number: "4347820595",
      can_track: true,
      ozon_point_name: "ПВЗ Тверская",
    })
    expect(publicOrder).not.toHaveProperty("email")
    expect(publicOrder).not.toHaveProperty("access_token")
    expect(publicOrder).not.toHaveProperty("url")
    expect(publicOrder).not.toHaveProperty("ozon_order_number")
    expect(publicOrder).not.toHaveProperty("ozon_posting_number")
    expect(publicOrder).not.toHaveProperty("ozon_tracking")
    expect(publicOrder).not.toHaveProperty("ozon_label_url")
    expect(publicOrder).not.toHaveProperty("ozon_point_address")
    expect(publicOrder).not.toHaveProperty("city")
    expect(publicOrder.items[0]).not.toHaveProperty("sku")
  })
})
