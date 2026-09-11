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
          variant: { sku: "WA150", product_id: "prod_1" },
        },
      ],
    })
    expect(presented.display_id).toBe("12")
    expect(presented.status).toBe("awaiting_pack")
    expect(presented.customer_name).toBe("Иван Петров")
    expect(presented.items[0].sku).toBe("WA150")
    expect(presented.total).toBe(1500)
  })
})
