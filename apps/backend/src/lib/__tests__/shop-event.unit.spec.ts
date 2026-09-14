import { presentShopEvent, shopEventSearchFilters } from "../shop-event"

describe("presentShopEvent", () => {
  it("flattens a log row", () => {
    expect(
      presentShopEvent({
        id: "selog_1",
        kind: "ozon_unclaimed",
        level: "warn",
        title: "Не забрали на ПВЗ",
        message: "Покупатель не забрал заказ",
        order_id: "order_1",
        shop_number: "1234567890",
        posting_number: "123-1",
        from_status: "delivering",
        to_status: "cancelled",
        created_at: "2026-09-14T12:00:00.000Z",
      })
    ).toMatchObject({
      id: "selog_1",
      kind: "ozon_unclaimed",
      shop_number: "1234567890",
      from_status: "delivering",
      to_status: "cancelled",
    })
  })
})

describe("shopEventSearchFilters", () => {
  it("searches across message and numbers", () => {
    expect(shopEventSearchFilters("")).toEqual({})
    expect(shopEventSearchFilters("123")).toEqual({
      $or: [
        { title: { $ilike: "%123%" } },
        { message: { $ilike: "%123%" } },
        { order_id: { $ilike: "%123%" } },
        { shop_number: { $ilike: "%123%" } },
        { posting_number: { $ilike: "%123%" } },
        { kind: { $ilike: "%123%" } },
      ],
    })
  })
})
