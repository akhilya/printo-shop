import {
  extractOzonPostingStatus,
  mapOzonPostingStatus,
  ozonFbsCancelBody,
  ozonOrderCancelBody,
  ozonReturnKind,
  ozonReturnMessage,
  parseOzonPosting,
} from "../ozon-posting"

describe("mapOzonPostingStatus", () => {
  it("maps FBS and rocket statuses", () => {
    expect(mapOzonPostingStatus("awaiting_packaging")).toBe("awaiting_pack")
    expect(mapOzonPostingStatus("awaiting_deliver")).toBe("awaiting_deliver")
    expect(mapOzonPostingStatus("delivering")).toBe("delivering")
    expect(mapOzonPostingStatus("in_pickup_point")).toBe("delivering")
    expect(mapOzonPostingStatus("driver_pickup")).toBe("delivering")
    expect(mapOzonPostingStatus("delivered")).toBe("delivered")
    expect(mapOzonPostingStatus("returned")).toBe("returned")
    expect(mapOzonPostingStatus("not_accepted")).toBe("returned")
    expect(mapOzonPostingStatus("cancelled")).toBe("cancelled")
    expect(mapOzonPostingStatus("cancelled", "delivering")).toBe("returned")
    expect(mapOzonPostingStatus("unknown-thing")).toBeNull()
  })
})

describe("ozonReturnKind", () => {
  it("separates unclaimed, refused at PVZ, and reverse logistics", () => {
    expect(ozonReturnKind("not_accepted", "delivering")).toBe("refused")
    expect(ozonReturnKind("cancelled", "delivering")).toBe("unclaimed")
    expect(ozonReturnKind("cancelled", "in_pickup_point")).toBe("unclaimed")
    expect(ozonReturnKind("cancelled", "awaiting_packaging")).toBeNull()
    expect(ozonReturnKind("returned", "delivering")).toBe("returned")
    expect(ozonReturnMessage("unclaimed")).toMatch(/не забрал/i)
    expect(ozonReturnMessage("refused")).toMatch(/отказался/i)
  })
})

describe("parseOzonPosting", () => {
  it("reads posting products and status", () => {
    const parsed = parseOzonPosting({
      result: {
        posting_number: "111-1",
        order_number: "111",
        status: "awaiting_packaging",
        products: [
          { product_id: 55, quantity: 2 },
          { sku: 9, quantity: 1 },
        ],
      },
    })
    expect(parsed).toEqual({
      postingNumber: "111-1",
      orderNumber: "111",
      status: "awaiting_packaging",
      products: [
        { productId: 55, quantity: 2 },
        { productId: 9, quantity: 1 },
      ],
    })
  })
})

describe("extractOzonPostingStatus", () => {
  it("reads nested tracking status", () => {
    expect(
      extractOzonPostingStatus({ tracking: { status: "In_Transit" } })
    ).toBe("In_Transit")
  })
})

describe("ozon cancel payloads", () => {
  it("cancels an own-site order by order number", () => {
    expect(ozonOrderCancelBody("123-456")).toEqual({
      order_number: "123-456",
      reason_id: 508,
    })
  })

  it("cancels an FBS posting with a documented reason", () => {
    expect(ozonFbsCancelBody("123-456-1")).toEqual({
      posting_number: "123-456-1",
      cancel_reason_id: 402,
      cancel_reason_message: "Отмена заказа магазином",
    })
  })
})
