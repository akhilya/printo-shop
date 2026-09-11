import { mapMedusaOrderStatus, presentDelegatOrder } from "../delegat-bridge/orders"

describe("mapMedusaOrderStatus", () => {
  it("maps completed paid orders to packing", () => {
    expect(mapMedusaOrderStatus("completed")).toBe("awaiting_pack")
    expect(mapMedusaOrderStatus("canceled")).toBe("cancelled")
    expect(mapMedusaOrderStatus("pending")).toBe("unpaid")
  })
})

describe("presentDelegatOrder", () => {
  it("flattens address and items", () => {
    const presented = presentDelegatOrder({
      id: "order_1",
      display_id: 12,
      status: "completed",
      email: "a@test.ru",
      currency_code: "rub",
      summary: { current_order_total: { numeric: 1500 } },
      shipping_address: {
        first_name: "Иван",
        last_name: "Петров",
        phone: "+7999",
        city: "Москва",
        address_1: "Тверская 1",
      },
      items: [
        {
          title: "Фигурка",
          quantity: 2,
          unit_price: 750,
          thumbnail: "https://cdn/x.webp",
          variant: {
            sku: "WA150",
            product_id: "prod_1",
            title: "126мм",
            product: { title: "Temple Assassins" },
          },
        },
      ],
    })
    expect(presented.display_id).toBe("12")
    expect(presented.status).toBe("awaiting_pack")
    expect(presented.customer_name).toBe("Иван Петров")
    expect(presented.items[0].sku).toBe("WA150")
    expect(presented.items[0].name).toBe("Temple Assassins · 126мм · WA150")
    expect(presented.comment).toBe("Temple Assassins · 126мм · WA150 ×2")
    expect(presented.total).toBe(1500)
    expect(presented.shipping_address).toBe("Тверская 1, Москва")
  })

  it("prefers the 10-digit shop number over display_id", () => {
    const presented = presentDelegatOrder({
      id: "order_1",
      display_id: 1,
      status: "completed",
      metadata: { shop_number: "1234567890" },
      items: [],
    })
    expect(presented.display_id).toBe("1234567890")
  })

  it("prefixes Ozon PVZ onto the address", () => {
    const presented = presentDelegatOrder({
      id: "order_2",
      status: "completed",
      metadata: {
        ozon_point_name: "ПВЗ Тверская",
        ozon_point_address: "Тверская 1",
      },
      shipping_address: { city: "Москва", address_1: "Тверская 1" },
      items: [],
    })
    expect(presented.shipping_address).toBe(
      "Ozon ПВЗ: ПВЗ Тверская, Тверская 1, Москва"
    )
  })
})
