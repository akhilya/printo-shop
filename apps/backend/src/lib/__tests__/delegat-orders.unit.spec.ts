import { mapMedusaOrderStatus, presentDelegatOrder } from "../delegat-bridge/orders"

describe("mapMedusaOrderStatus", () => {
  it("maps completed paid orders to packing", () => {
    expect(mapMedusaOrderStatus("completed")).toBe("awaiting_pack")
    expect(mapMedusaOrderStatus("completed", "delivering")).toBe("delivering")
    expect(mapMedusaOrderStatus("completed", "delivered")).toBe("delivered")
    expect(mapMedusaOrderStatus("canceled")).toBe("cancelled")
    expect(mapMedusaOrderStatus("cancelled", "delivered")).toBe("cancelled")
    expect(mapMedusaOrderStatus("canceled", "delivered")).toBe("cancelled")
    expect(mapMedusaOrderStatus("pending")).toBe("unpaid")
    expect(mapMedusaOrderStatus("pending", null, true)).toBe("awaiting_pack")
    expect(mapMedusaOrderStatus("pending", "delivering", true)).toBe(
      "delivering"
    )
    expect(mapMedusaOrderStatus("completed", "awaiting_deliver", true)).toBe(
      "awaiting_deliver"
    )
    expect(mapMedusaOrderStatus("completed", "returned", true)).toBe("returned")
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

  it("maps a paid pending cart order as packing", () => {
    const presented = presentDelegatOrder({
      id: "order_paid_pending",
      status: "pending",
      payment_collections: [{ status: "captured" }],
      metadata: { shop_number: "1234567890" },
      items: [],
    })
    expect(presented.status).toBe("awaiting_pack")
  })

  it("treats a pending order with an Ozon posting as packing", () => {
    const presented = presentDelegatOrder({
      id: "order_ozon_pending",
      status: "pending",
      metadata: {
        shop_number: "1234567890",
        ozon_posting_number: "123-456-1",
      },
      items: [],
    })
    expect(presented.status).toBe("awaiting_pack")
  })

  it("maps packed orders as ready to ship", () => {
    const presented = presentDelegatOrder({
      id: "order_packed",
      status: "completed",
      metadata: { shop_fulfillment: "awaiting_deliver", shop_number: "1234567890" },
      items: [],
    })
    expect(presented.status).toBe("awaiting_deliver")
  })

  it("maps handed-over orders as delivering", () => {
    const presented = presentDelegatOrder({
      id: "order_3",
      status: "completed",
      metadata: { shop_fulfillment: "delivering", shop_number: "1234567890" },
      items: [],
    })
    expect(presented.status).toBe("delivering")
  })

  it("prefers native Medusa fulfillment over legacy metadata", () => {
    const presented = presentDelegatOrder({
      id: "order_native",
      status: "completed",
      metadata: { shop_fulfillment: "awaiting_pack", shop_number: "1234567890" },
      fulfillments: [{ id: "ful_1", shipped_at: "2026-09-14T10:00:00Z" }],
      items: [],
    })
    expect(presented.status).toBe("delivering")
  })

  it("maps a Medusa-cancelled order as cancelled even after fulfillment", () => {
    const presented = presentDelegatOrder({
      id: "order_canceled",
      status: "canceled",
      metadata: { shop_number: "1234567890", shop_fulfillment: "delivered" },
      fulfillments: [
        { id: "ful_1", shipped_at: "2026-09-14T10:00:00Z", delivered_at: "2026-09-15T10:00:00Z" },
      ],
      items: [],
    })
    expect(presented.status).toBe("cancelled")
    expect(presented.raw_status).toBe("canceled")
  })

  it("maps a Medusa-cancelled order as cancelled when only canceled_at is set", () => {
    const presented = presentDelegatOrder({
      id: "order_canceled_at",
      status: "completed",
      canceled_at: "2026-09-16T10:00:00Z",
      fulfillments: [{ id: "ful_1", delivered_at: "2026-09-15T10:00:00Z" }],
      items: [],
    })
    expect(presented.status).toBe("cancelled")
  })

  it("maps an Ozon return onto returned", () => {
    const presented = presentDelegatOrder({
      id: "order_return",
      status: "completed",
      metadata: {
        shop_number: "1234567890",
        ozon_posting_status: "returned",
      },
      items: [],
    })
    expect(presented.status).toBe("returned")
  })

  it("keeps an unclaimed pickup as returned even if Ozon says cancelled", () => {
    const presented = presentDelegatOrder({
      id: "order_unclaimed",
      status: "completed",
      metadata: {
        shop_number: "1234567890",
        ozon_posting_status: "cancelled",
        ozon_return_kind: "unclaimed",
      },
      fulfillments: [{ id: "ful_1", shipped_at: "2026-09-14T10:00:00Z" }],
      items: [],
    })
    expect(presented.status).toBe("returned")
  })

  it("flags a packed Ozon label", () => {
    const presented = presentDelegatOrder({
      id: "order_label",
      status: "completed",
      metadata: {
        shop_number: "1234567890",
        shop_fulfillment: "awaiting_deliver",
        ozon_posting_number: "123-1",
        ozon_label_url: "https://shop/static/ozon-label-123-1.pdf",
      },
      items: [],
    })
    expect(presented.has_label).toBe(true)
    expect(presented.ozon_posting_number).toBe("123-1")
  })

  it("flags a packed posting even before the PDF is stored", () => {
    const presented = presentDelegatOrder({
      id: "order_packed",
      status: "completed",
      metadata: {
        shop_number: "1234567890",
        ozon_posting_number: "123-1",
        ozon_packed_at: "2026-09-18T13:16:20.000Z",
      },
      items: [],
    })
    expect(presented.has_label).toBe(true)
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
