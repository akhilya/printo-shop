import {
  presentShopEvent,
  prettyShopEventText,
  shopEventErrorDetail,
  shopEventSearchFilters,
} from "../shop-event"

describe("presentShopEvent", () => {
  it("flattens a log row", () => {
    expect(
      presentShopEvent({
        id: "selog_1",
        kind: "ozon_unclaimed",
        level: "warn",
        title: "Не забрали на ПВЗ",
        message: "Покупатель не забрал заказ",
        detail: 'Ozon HTTP 400: {"message":"invalid"}',
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
      detail: 'Ozon HTTP 400: {"message":"invalid"}',
    })
  })

  it("pretty-prints json from the raw body", () => {
    const presented = presentShopEvent({
      message: 'Ozon HTTP 400: {"code":3,"message":"invalid"}',
      detail: '{"splits":[1]}',
    })
    expect(presented.dump).toContain('"code": 3')
    expect(presented.dump).toContain('"splits"')
  })
})

describe("prettyShopEventText", () => {
  it("keeps prefix and formats the json payload", () => {
    expect(prettyShopEventText('Ozon HTTP 400: {"message":"bad"}')).toBe(
      'Ozon HTTP 400:\n{\n  "message": "bad"\n}'
    )
  })
})

describe("shopEventErrorDetail", () => {
  it("keeps name, message and stack", () => {
    const error = new Error("Ozon HTTP 400: boom")
    const detail = shopEventErrorDetail(error)
    expect(detail.startsWith("Error\nOzon HTTP 400: boom")).toBe(true)
    expect(detail.split("\n").length).toBeGreaterThan(2)
  })
})

describe("shopEventSearchFilters", () => {
  it("searches across message and numbers", () => {
    expect(shopEventSearchFilters("")).toEqual({})
    expect(shopEventSearchFilters("123")).toEqual({
      $or: [
        { title: { $ilike: "%123%" } },
        { message: { $ilike: "%123%" } },
        { detail: { $ilike: "%123%" } },
        { order_id: { $ilike: "%123%" } },
        { shop_number: { $ilike: "%123%" } },
        { posting_number: { $ilike: "%123%" } },
        { kind: { $ilike: "%123%" } },
      ],
    })
  })
})
