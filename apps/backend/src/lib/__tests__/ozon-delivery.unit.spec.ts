import {
  extractOzonAmount,
  extractOzonCreateIds,
  isOzonRocketCreds,
  loadOzonPoints,
  nearestOzonPoints,
  normalizeOzonPhone,
  ozonCredsFromRow,
  ozonTrackingUrl,
  parseOzonPoints,
  pointsInBounds,
} from "../ozon-delivery"

describe("ozonCredsFromRow", () => {
  it("needs both client id and api key", () => {
    expect(ozonCredsFromRow({ ozon_client_id: "1" })).toBeNull()
    expect(
      ozonCredsFromRow({ ozon_client_id: "1", ozon_api_key: "secret" })
    ).toEqual({
      clientId: "1",
      apiKey: "secret",
      fromPlaceId: "",
    })
  })

  it("detects rocket principal credentials", () => {
    expect(
      isOzonRocketCreds({
        clientId: "Principal_abc",
        apiKey: "x",
        fromPlaceId: "",
      })
    ).toBe(true)
    expect(
      isOzonRocketCreds({ clientId: "12345", apiKey: "x", fromPlaceId: "" })
    ).toBe(false)
  })
})

describe("normalizeOzonPhone", () => {
  it("turns local numbers into 7XXXXXXXXXX", () => {
    expect(normalizeOzonPhone("+7 (999) 123-45-67")).toBe("79991234567")
    expect(normalizeOzonPhone("8 999 123-45-67")).toBe("79991234567")
    expect(normalizeOzonPhone("9991234567")).toBe("79991234567")
  })
})

describe("parseOzonPoints", () => {
  it("reads seller map_point_id and nested coordinates", () => {
    const points = parseOzonPoints({
      points: [
        {
          map_point_id: 77,
          coordinate: { latitude: 55.75, longitude: 37.61 },
          name: "ПВЗ Тверская",
          address: "Тверская 1",
        },
      ],
    })
    expect(points).toEqual([
      {
        id: "77",
        name: "ПВЗ Тверская",
        address: "Тверская 1",
        lat: 55.75,
        lon: 37.61,
        schedule: undefined,
        city: undefined,
      },
    ])
  })

  it("skips clustered map buckets without a point id", () => {
    expect(
      parseOzonPoints({
        clusters: [
          {
            points_count: 40,
            coordinate: { latitude: 55.7, longitude: 37.6 },
          },
        ],
      })
    ).toEqual([])
  })

  it("reads rocket variants", () => {
    const points = parseOzonPoints({
      data: [
        {
          id: "abc",
          settlement: "Москва",
          address: "Арбат 10",
          lat: 55.74,
          long: 37.59,
        },
      ],
    })
    expect(points[0]).toMatchObject({
      id: "abc",
      city: "Москва",
      lat: 55.74,
      lon: 37.59,
    })
  })
})

describe("pointsInBounds", () => {
  it("keeps only points inside the map viewport", () => {
    const moscow = { id: "msk", name: "a", address: "a", lat: 55.75, lon: 37.62 }
    const spb = { id: "spb", name: "b", address: "b", lat: 59.93, lon: 30.31 }
    const visible = pointsInBounds(
      [moscow, spb],
      { south: 55.5, west: 37.3, north: 56, east: 37.9 }
    )
    expect(visible.map((point) => point.id)).toEqual(["msk"])
  })
})

describe("nearestOzonPoints", () => {
  it("keeps the closest points", () => {
    const nearest = nearestOzonPoints(
      [
        { id: "far", name: "a", address: "a", lat: 60, lon: 40 },
        { id: "near", name: "b", address: "b", lat: 55.76, lon: 37.62 },
      ],
      { lat: 55.75, lon: 37.61 },
      1
    )
    expect(nearest[0].id).toBe("near")
  })
})

describe("extractOzonAmount", () => {
  it("reads Ozon money units", () => {
    expect(
      extractOzonAmount({
        splits: [
          {
            delivery_method: {
              price: { currency_code: "RUB", units: 420, nanos: 0 },
            },
          },
        ],
      })
    ).toBe(420)
    expect(extractOzonAmount({ amount: 350 })).toBe(350)
  })
})

describe("extractOzonCreateIds", () => {
  it("reads order and posting numbers", () => {
    expect(
      extractOzonCreateIds({
        order_number: "123-456",
        posting_number: ["123-456-1"],
      })
    ).toEqual({
      orderNumber: "123-456",
      postingNumber: "123-456-1",
      trackingUrl: "https://www.ozon.ru/my/orderdetails/?order=123-456",
    })
  })
})

describe("ozonTrackingUrl", () => {
  it("returns null without a number", () => {
    expect(ozonTrackingUrl("")).toBeNull()
  })
})

describe("loadOzonPoints", () => {
  const fetchFn = global.fetch

  afterEach(() => {
    global.fetch = fetchFn
  })

  it("does not load points when the map is zoomed out", async () => {
    const result = await loadOzonPoints(
      { ozon_client_id: "1", ozon_api_key: "secret" },
      { zoom: 5, south: 50, west: 20, north: 70, east: 50 }
    )
    expect(result.points).toEqual([])
    expect(result.message).toMatch(/Приблизьте/)
  })

  it("geocodes the city even without keys so the map can center", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ lat: "55.75", lon: "37.61" }],
    })
    const result = await loadOzonPoints({}, { city: "Москва" })
    expect(result.configured).toBe(false)
    expect(result.points).toEqual([])
    expect(result.center).toEqual({ lat: 55.75, lon: 37.61 })
    expect(result.message).toMatch(/Подключите Ozon/)
  })
})
