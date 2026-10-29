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
    expect(detail).toContain("Ozon HTTP 400: boom")
    expect(detail).toContain('"name": "Error"')
    expect(detail).toContain("stack")
  })

  it("prints the full ozon request body", () => {
    const error = new Error("Ozon HTTP 400: either sku or offer_id")
    ;(error as { ozonRequests: unknown[] }).ozonRequests = [
      {
        method: "POST",
        url: "https://api-seller.ozon.ru/v2/delivery/checkout",
        path: "/v2/delivery/checkout",
        body: {
          delivery_schema: "FBS",
          items: [{ quantity: 1 }],
        },
      },
    ]
    const detail = shopEventErrorDetail(error)
    expect(detail).toContain("/v2/delivery/checkout")
    expect(detail).toContain('"delivery_schema": "FBS"')
    expect(detail).toContain('"items"')
  })

  it("includes checkout responses needed to diagnose delivery availability", () => {
    const error = new Error("Ozon checkout: split 1 has no delivery slot") as Error & {
      ozonCheckoutResponses: unknown[]
    }
    error.ozonCheckoutResponses = [
      {
        schema: "FBS",
        response: {
          splits: [{
            delivery_methods: [{
              delivery_method_id: 42,
              unavailable_reason: "NO_AVAILABLE_TIMESLOT",
              timeslots: [],
            }],
          }],
        },
      },
    ]

    const detail = shopEventErrorDetail(error)
    expect(detail).toContain('"checkout_responses"')
    expect(detail).toContain("NO_AVAILABLE_TIMESLOT")
    expect(detail).toContain('"schema": "FBS"')
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
