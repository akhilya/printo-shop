import { presentPaidStoreOrder } from "../checkout-order"

describe("presentPaidStoreOrder", () => {
  it("exposes shop number, totals and the PVZ for the success page", () => {
    expect(
      presentPaidStoreOrder({
        id: "order_1",
        display_id: 12,
        email: "anna@test.ru",
        status: "pending",
        total: 6400,
        currency_code: "rub",
        metadata: {
          shop_number: "4347820595",
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
            unit_price: 6400,
            thumbnail: "https://img/x.jpg",
            variant: { sku: "SKU-1" },
          },
        ],
      })
    ).toMatchObject({
      order_id: "order_1",
      shop_number: "4347820595",
      email: "anna@test.ru",
      total: 6400,
      ozon_point_name: "ПВЗ Тверская",
      items: [{ title: "Фигурка", sku: "SKU-1", quantity: 1 }],
    })
  })
})
