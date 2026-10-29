import {
  clusterOzonPoints,
  extractOzonAmount,
  extractOzonCreateIds,
  loadOzonPoints,
  nearestOzonPoints,
  normalizeOzonPhone,
  ozonOrderContacts,
  ozonOrderCreateSplits,
  ozonCheckoutResponseDiagnostic,
  ozonPackErrorMessage,
  ozonAdminErrorMessage,
  ozonCreateDeliveryType,
  createOzonDeliveryOrder,
  ozonRequestsOf,
  ozonCredsFromRow,
  ozonSellerReady,
  ozonTrackingUrl,
  parseOzonClusters,
  parseOzonMapPointIds,
  parseOzonPoints,
  parseOzonPostingNumbers,
  ozonMapViewport,
  pointsInBounds,
  clustersInBounds,
  normalizeOzonBounds,
  tileOzonBounds,
  quoteOzonDelivery,
  ozonQuoteErrorMessage,
  ozonCartArticle,
  ozonCheckoutItems,
  ozonPaidUnitPrice,
  applyOzonPaidGoodsTotal,
  ozonOrderItemsFromLines,
  hydrateOzonLineItems,
  ozonOrderItemsForCreate,
  resolveOzonMapLayers,
  sellerAuthHeaders,
  sellerAuthHeadersFor,
  fetchOzonAppToken,
  resetOzonAppTokenCache,
  resetOzonPvzCache,
  setOzonTokenPersist,
  ozonAuthorizeUrl,
  ozonOAuthRedirectUri,
  exchangeOzonAuthCode,
} from "../ozon-delivery"

describe("ozonCredsFromRow", () => {
  it("ignores seller api keys", () => {
    expect(
      ozonCredsFromRow({ ozon_client_id: "12345", ozon_api_key: "seller-key" })
    ).toBeNull()
  })

  it("reads the private app client id and secret", () => {
    expect(
      ozonCredsFromRow({
        ozon_client_id: "app-uuid",
        ozon_oauth_token: "app-secret",
        ozon_refresh_token: "refresh-1",
      })
    ).toEqual({
      clientId: "app-uuid",
      clientSecret: "app-secret",
      refreshToken: "refresh-1",
      fromPlaceId: "",
      accessToken: "",
    })
  })

  it("keeps a jwt in the oauth field as the access token", () => {
    expect(
      ozonCredsFromRow({ ozon_oauth_token: "aaa.bbb.ccc" })
    ).toEqual({
      clientId: "",
      clientSecret: "",
      refreshToken: "",
      fromPlaceId: "",
      accessToken: "aaa.bbb.ccc",
    })
  })

  it("is not ready for seller calls until the cabinet is connected", () => {
    expect(
      ozonSellerReady(
        ozonCredsFromRow({
          ozon_client_id: "app-uuid",
          ozon_oauth_token: "app-secret",
        })
      )
    ).toBe(false)
    expect(
      ozonSellerReady(
        ozonCredsFromRow({
          ozon_client_id: "app-uuid",
          ozon_oauth_token: "app-secret",
          ozon_refresh_token: "refresh-1",
        })
      )
    ).toBe(true)
    expect(
      ozonSellerReady(ozonCredsFromRow({ ozon_oauth_token: "aaa.bbb.ccc" }))
    ).toBe(true)
  })
})

describe("sellerAuthHeaders", () => {
  const creds = {
    clientId: "app-uuid",
    clientSecret: "app-secret",
    refreshToken: "refresh-1",
    fromPlaceId: "",
    accessToken: "aaa.bbb.ccc",
  }

  it("uses a bearer token for private apps", () => {
    expect(sellerAuthHeaders(creds)).toEqual({
      "Content-Type": "application/json",
      Authorization: "Bearer aaa.bbb.ccc",
    })
  })

  it("does not send seller api keys or a client secret", () => {
    expect(
      sellerAuthHeaders({ ...creds, accessToken: "" })
    ).toEqual({
      "Content-Type": "application/json",
    })
    expect(
      sellerAuthHeaders({ ...creds, accessToken: "not-a-jwt" })
    ).toEqual({
      "Content-Type": "application/json",
    })
  })

  it("sends bearer for map, checkout and postings", () => {
    expect(sellerAuthHeadersFor(creds, "/v1/delivery/map")).toEqual({
      "Content-Type": "application/json",
      Authorization: "Bearer aaa.bbb.ccc",
    })
    expect(sellerAuthHeadersFor(creds, "/v3/posting/fbs/get")).toEqual({
      "Content-Type": "application/json",
      Authorization: "Bearer aaa.bbb.ccc",
    })
  })
})

describe("fetchOzonAppToken", () => {
  const fetchFn = global.fetch

  afterEach(() => {
    global.fetch = fetchFn
    resetOzonAppTokenCache()
    setOzonTokenPersist(null)
  })

  it("refreshes a seller-issued token, not a client_credentials token", async () => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          access_token: "aaa.bbb.ccc",
          expires_in: 3600,
          token_type: "Bearer",
        }),
    })) as typeof fetch
    await expect(
      fetchOzonAppToken({
        clientId: "app-uuid",
        clientSecret: "app-secret",
        refreshToken: "refresh-1",
      })
    ).resolves.toBe("aaa.bbb.ccc")
    const call = (global.fetch as jest.Mock).mock.calls[0]
    expect(String(call[0])).toBe("https://xapi.ozon.ru/oauth/token")
    expect(JSON.parse(call[1].body)).toEqual({
      grant_type: "refresh_token",
      client_id: "app-uuid",
      client_secret: "app-secret",
      refresh_token: "refresh-1",
    })
    expect(call[1].headers["Content-Type"]).toBe("application/json")
  })

  it("does not use client_credentials for seller methods", async () => {
    global.fetch = jest.fn()
    await expect(
      fetchOzonAppToken({ clientId: "app-uuid", clientSecret: "app-secret" })
    ).rejects.toThrow(/кабинет/)
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it("persists a rotated refresh token from Ozon", async () => {
    const persist = jest.fn(async () => undefined)
    setOzonTokenPersist(persist)
    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          access_token: "aaa.bbb.ccc",
          refresh_token: "refresh-2",
          expires_in: 3600,
        }),
    })) as typeof fetch
    await expect(
      fetchOzonAppToken({
        clientId: "app-uuid",
        clientSecret: "app-secret",
        refreshToken: "refresh-1",
      })
    ).resolves.toBe("aaa.bbb.ccc")
    expect(persist).toHaveBeenCalledWith({
      accessToken: "aaa.bbb.ccc",
      refreshToken: "refresh-2",
    })
  })

  it("clears the stored refresh token when Ozon rejects it", async () => {
    const persist = jest.fn(async () => undefined)
    setOzonTokenPersist(persist)
    global.fetch = jest.fn(async () => ({
      ok: false,
      status: 400,
      text: async () =>
        JSON.stringify({ code: 3, message: "invalid_refresh_token", details: [] }),
    })) as typeof fetch
    await expect(
      fetchOzonAppToken({
        clientId: "app-uuid",
        clientSecret: "app-secret",
        refreshToken: "refresh-1",
      })
    ).rejects.toThrow(/invalid_refresh_token/)
    expect(persist).toHaveBeenCalledWith({
      accessToken: "",
      refreshToken: "",
    })
  })

  it("reuses a cached token", async () => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({ access_token: "aaa.bbb.ccc", expires_in: 3600 }),
    })) as typeof fetch
    const input = {
      clientId: "app-uuid",
      clientSecret: "app-secret",
      refreshToken: "refresh-1",
    }
    await expect(fetchOzonAppToken(input)).resolves.toBe("aaa.bbb.ccc")
    await expect(fetchOzonAppToken(input)).resolves.toBe("aaa.bbb.ccc")
    expect(global.fetch).toHaveBeenCalledTimes(1)
  })
})

describe("ozonAuthorizeUrl", () => {
  it("sends the seller to grant the private app", () => {
    const url = ozonAuthorizeUrl({
      clientId: "app-uuid",
      redirectUri: "https://api.example.com/hooks/ozon/oauth",
      state: "csrf-1",
    })
    expect(url.startsWith("https://seller.ozon.ru/app/appstore/oauth/authorize?")).toBe(
      true
    )
    const parsed = new URL(url)
    expect(parsed.searchParams.get("response_type")).toBe("code")
    expect(parsed.searchParams.get("access_type")).toBe("offline")
    expect(parsed.searchParams.get("client_id")).toBe("app-uuid")
    expect(parsed.searchParams.get("redirect_uri")).toBe(
      "https://api.example.com/hooks/ozon/oauth"
    )
    expect(parsed.searchParams.get("state")).toBe("csrf-1")
    expect(parsed.searchParams.get("scope")).toContain("seller-api.ozon-logistics")
    expect(parsed.searchParams.get("scope")).toContain("seller-api.product")
    expect(parsed.searchParams.get("scope")).toContain("seller-api.posting-fbs")
    expect(parsed.searchParams.get("scope")).toContain("seller-api.review")
  })

  it("builds the callback from the public backend url", () => {
    expect(ozonOAuthRedirectUri({ MEDUSA_BACKEND_URL: "https://api.example.com/" })).toBe(
      "https://api.example.com/hooks/ozon/oauth"
    )
  })
})

describe("exchangeOzonAuthCode", () => {
  const fetchFn = global.fetch

  afterEach(() => {
    global.fetch = fetchFn
    resetOzonAppTokenCache()
  })

  it("exchanges a seller grant code for access and refresh tokens", async () => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          access_token: "aaa.bbb.ccc",
          refresh_token: "refresh-1",
          expires_in: 3600,
        }),
    })) as typeof fetch
    await expect(
      exchangeOzonAuthCode({
        clientId: "app-uuid",
        clientSecret: "app-secret",
        code: "auth-code",
        redirectUri: "https://api.example.com/hooks/ozon/oauth",
      })
    ).resolves.toEqual({
      accessToken: "aaa.bbb.ccc",
      refreshToken: "refresh-1",
    })
    expect(JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body)).toEqual({
      grant_type: "authorization_code",
      client_id: "app-uuid",
      client_secret: "app-secret",
      code: "auth-code",
      redirect_uri: "https://api.example.com/hooks/ozon/oauth",
    })
  })
})

describe("normalizeOzonPhone", () => {
  it("turns local numbers into 7XXXXXXXXXX", () => {
    expect(normalizeOzonPhone("+7 (999) 123-45-67")).toBe("79991234567")
    expect(normalizeOzonPhone("8 999 123-45-67")).toBe("79991234567")
    expect(normalizeOzonPhone("9991234567")).toBe("79991234567")
  })

  it("drops numbers that Ozon would reject", () => {
    expect(normalizeOzonPhone("12345")).toBe("")
    expect(normalizeOzonPhone("+7")).toBe("")
  })
})

describe("ozonOrderContacts", () => {
  it("sends recipient_phone as 10-15 digits", () => {
    const contacts = ozonOrderContacts({
      name: "Иван Петров",
      phone: "+7 (999) 123-45-67",
    })
    expect(contacts.recipient).toEqual({
      recipient_first_name: "Иван",
      recipient_last_name: "Петров",
      recipient_phone: "79991234567",
    })
    expect(contacts.buyer.phone).toBe("79991234567")
  })
})

describe("ozonPackErrorMessage", () => {
  it("hides Ozon phone validation from the dashboard", () => {
    expect(
      ozonPackErrorMessage(
        'Ozon HTTP 400: {"code":3, "message":"invalid OrderCreateRequestV2_Recipient.RecipientPhone: value does not match regex pattern"}'
      )
    ).toBe("Не удалось создать отправление: проверьте телефон получателя.")
  })

  it("keeps the Ozon DeliveryMethod text for the dashboard log", () => {
    expect(
      ozonPackErrorMessage(
        'Ozon HTTP 400: {"code":3, "message":"invalid OrderCreateRequestV2.Splits[0]: embedded message failed validation | caused by: invalid OrderCreateRequestV2_Split.DeliveryMethod"}'
      )
    ).toMatch(/Ozon 400.*DeliveryMethod/)
  })

  it("extracts the Ozon message from HTTP JSON", () => {
    expect(
      ozonAdminErrorMessage(
        'Ozon HTTP 400: {"code":3, "message":"Request validation error: invalid split"}'
      )
    ).toBe("Ozon 400: Request validation error: invalid split")
  })
})

describe("ozonOrderCreateSplits", () => {
  const cart = [
    { article: "WA150", quantity: 1, price: 1500, sku: 987 },
  ]

  it("maps checkout timeslots onto the order create delivery method", () => {
    expect(
      ozonOrderCreateSplits(
        {
          splits: [
            {
              warehouse_id: 555,
              delivery_schema: "FBS",
              delivery_method: {
                id: 42,
                delivery_type: "PVZ",
                timeslots: [
                  {
                    timeslot_id: 9,
                    logistic_date_range: {
                      from: "2026-09-18T08:00:00Z",
                      to: "2026-09-18T16:00:00Z",
                    },
                  },
                ],
              },
              items: [{ offer_id: "WA150", sku: 987, quantity: 1 }],
            },
          ],
        },
        { items: cart, fromPlaceId: "555" }
      )
    ).toEqual([
      {
        warehouse_id: 555,
        delivery_method: {
          delivery_method_id: 42,
          delivery_type: "PVZ",
          timeslot_id: 9,
          logistic_date_range: {
            from: "2026-09-18T08:00:00Z",
            to: "2026-09-18T16:00:00Z",
          },
        },
        items: [
          {
            offer_id: "WA150",
            quantity: 1,
            price: { currency_code: "RUB", units: 1500 },
          },
        ],
      },
    ])
  })

  it("maps a postamat and cart prices when checkout items omit them", () => {
    expect(ozonCreateDeliveryType("POSTAMAT")).toBe("POSTAMAT")
    const splits = ozonOrderCreateSplits(
      {
        splits: [
          {
            warehouse_id: 1,
            delivery_method: {
              delivery_method_id: 7,
              delivery_type: "POSTAMAT",
              timeslot_id: 3,
              logistic_date_range: {
                from: "2026-09-18T08:00:00Z",
                to: "2026-09-18T12:00:00Z",
              },
            },
          },
        ],
      },
      { items: cart }
    )
    expect(splits).toMatchObject([
      {
        delivery_method: {
          delivery_method_id: 7,
          delivery_type: "POSTAMAT",
          timeslot_id: 3,
        },
        items: [{ offer_id: "WA150", price: { units: 1500 } }],
      },
    ])
    expect(splits[0]?.items[0]).not.toHaveProperty("sku")
  })

  it("puts the paid shop shipping onto the delivery method", () => {
    const splits = ozonOrderCreateSplits(
      {
        splits: [
          {
            warehouse_id: 555,
            delivery_method: {
              id: 42,
              delivery_type: "PVZ",
              timeslots: [
                {
                  timeslot_id: 9,
                  logistic_date_range: {
                    from: "2026-09-18T08:00:00Z",
                    to: "2026-09-18T16:00:00Z",
                  },
                },
              ],
              price: { currency_code: "RUB", units: 0 },
            },
            items: [{ offer_id: "WA150", sku: 987, quantity: 1 }],
          },
        ],
      },
      { items: cart, fromPlaceId: "555", shippingTotal: 350 }
    )
    expect(splits[0]?.delivery_method).toMatchObject({
      delivery_method_id: 42,
      price: { currency_code: "RUB", units: 350 },
    })
  })

  it("keeps the shop paid price when checkout returns a catalog price", () => {
    const splits = ozonOrderCreateSplits(
      {
        splits: [
          {
            warehouse_id: 1,
            delivery_method: {
              delivery_method_id: 7,
              delivery_type: "PVZ",
              timeslot_id: 3,
              logistic_date_range: {
                from: "2026-09-18T08:00:00Z",
                to: "2026-09-18T12:00:00Z",
              },
            },
            items: [
              {
                offer_id: "WA150",
                quantity: 1,
                price: { currency_code: "RUB", units: 2500 },
              },
            ],
          },
        ],
      },
      { items: [{ article: "WA150", quantity: 1, price: 1200 }] }
    )
    expect(splits[0]?.items[0]?.price).toEqual({
      currency_code: "RUB",
      units: 1200,
    })
  })

  it("rejects a checkout split without a timeslot", () => {
    expect(() =>
      ozonOrderCreateSplits(
        {
          splits: [
            {
              warehouse_id: 555,
              delivery_method: { id: 42, delivery_type: "PVZ", timeslots: [] },
            },
          ],
        },
        { items: cart }
      )
    ).toThrow(/интервала доставки/)
  })

  it("explains a checkout response without splits", () => {
    expect(() => ozonOrderCreateSplits({ amount: 320 }, { items: cart })).toThrow(
      /без отправлений/
    )
  })
})

describe("ozonCheckoutResponseDiagnostic", () => {
  it("keeps delivery details and redacts personal fields", () => {
    expect(
      ozonCheckoutResponseDiagnostic({
        buyer_phone: "79991234567",
        splits: [
          {
            warehouse_id: 555,
            delivery_methods: [
              {
                delivery_method_id: 42,
                unavailable_reason: "NO_AVAILABLE_TIMESLOT",
                timeslots: [],
              },
            ],
          },
        ],
      })
    ).toEqual({
      buyer_phone: "[redacted]",
      splits: [
        {
          warehouse_id: 555,
          delivery_methods: [
            {
              delivery_method_id: 42,
              unavailable_reason: "NO_AVAILABLE_TIMESLOT",
              timeslots: [],
            },
          ],
        },
      ],
    })
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

  it("skips disabled pickup points", () => {
    expect(
      parseOzonPoints({
        points: [
          {
            enabled: false,
            delivery_method: {
              map_point_id: 1,
              coordinates: { lat: 55, long: 37 },
            },
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

describe("parseOzonClusters", () => {
  it("reads map buckets and their viewport", () => {
    expect(
      parseOzonClusters({
        clusters: [
          {
            points_count: 40,
            coordinate: { lat: 55.7, long: 37.6 },
            viewport: {
              left_bottom: { lat: 55.5, long: 37.4 },
              right_top: { lat: 55.9, long: 37.8 },
            },
          },
        ],
      })
    ).toEqual([
      {
        count: 40,
        lat: 55.7,
        lon: 37.6,
        south: 55.5,
        west: 37.4,
        north: 55.9,
        east: 37.8,
      },
    ])
  })

  it("collects map_point_ids from single-point clusters", () => {
    expect(
      parseOzonMapPointIds({
        clusters: [
          {
            points_count: 1,
            map_point_ids: ["77", "88"],
            coordinate: { lat: 55.7, long: 37.6 },
          },
        ],
      })
    ).toEqual(["77", "88"])
  })

  it("does not treat a single pickup as a cluster", () => {
    expect(
      parseOzonClusters({
        clusters: [
          {
            points_count: 1,
            map_point_ids: ["77"],
            coordinate: { lat: 55.75, long: 37.61 },
          },
        ],
      })
    ).toEqual([])
  })
})

describe("resolveOzonMapLayers", () => {
  it("drops numbered clusters once street-level points exist", () => {
    const point = { id: "1", name: "a", address: "a", lat: 55, lon: 37 }
    const cluster = { count: 12, lat: 55, lon: 37 }
    expect(resolveOzonMapLayers([point], [cluster], 16).clusters).toEqual([])
    expect(resolveOzonMapLayers([], [cluster], 12).clusters).toHaveLength(1)
  })
})

describe("clusterOzonPoints", () => {
  it("groups nearby points when zoomed out", () => {
    const grouped = clusterOzonPoints(
      [
        { id: "1", name: "a", address: "a", lat: 55.75, lon: 37.61 },
        { id: "2", name: "b", address: "b", lat: 55.751, lon: 37.612 },
        { id: "3", name: "c", address: "c", lat: 59.93, lon: 30.31 },
      ],
      10,
      0.05
    )
    expect(grouped.points.map((point) => point.id)).toEqual(["3"])
    expect(grouped.clusters).toHaveLength(1)
    expect(grouped.clusters[0].count).toBe(2)
  })

  it("keeps points separate when zoomed in", () => {
    const grouped = clusterOzonPoints(
      [
        { id: "1", name: "a", address: "a", lat: 55.75, lon: 37.61 },
        { id: "2", name: "b", address: "b", lat: 55.751, lon: 37.612 },
      ],
      16
    )
    expect(grouped.clusters).toEqual([])
    expect(grouped.points).toHaveLength(2)
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

describe("normalizeOzonBounds", () => {
  it("clamps a wrapped leaflet world view into valid longs", () => {
    const bounds = normalizeOzonBounds({
      south: 40,
      west: -244,
      north: 70,
      east: 318,
    })
    expect(bounds.west).toBeGreaterThanOrEqual(-180)
    expect(bounds.east).toBeLessThanOrEqual(180)
    expect(bounds.east).toBeGreaterThan(bounds.west)
    expect(bounds.east - bounds.west).toBeGreaterThan(100)
  })
})

describe("tileOzonBounds", () => {
  it("keeps a city view as one tile", () => {
    expect(
      tileOzonBounds({ south: 55.6, west: 37.4, north: 55.9, east: 37.8 })
    ).toHaveLength(1)
  })

  it("splits a country-wide view into longitude strips", () => {
    const tiles = tileOzonBounds({
      south: 40,
      west: 20,
      north: 70,
      east: 140,
    })
    expect(tiles.length).toBeGreaterThan(1)
    expect(tiles[0]?.west).toBe(20)
    expect(tiles.at(-1)?.east).toBe(140)
    expect(tiles.every((tile) => tile.east - tile.west <= 50.0001)).toBe(true)
  })
})

describe("clustersInBounds", () => {
  it("keeps clusters on the right of a wide viewport", () => {
    const clusters = Array.from({ length: 120 }, (_, i) => ({
      count: 3,
      lat: 55,
      lon: 20 + i,
    }))
    const visible = clustersInBounds(clusters, {
      south: 40,
      west: 20,
      north: 70,
      east: 140,
    })
    expect(visible.some((item) => item.lon >= 100)).toBe(true)
    expect(visible.some((item) => item.lon <= 40)).toBe(true)
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

  it("does not let a zero deliveryPrice hide the real amount", () => {
    expect(extractOzonAmount({ deliveryPrice: 0, amount: 350 })).toBe(350)
    expect(extractOzonAmount({ delivery_cost: 0, tariff: 280 })).toBe(280)
    expect(
      extractOzonAmount({
        price: { currency_code: "RUB", units: 0, nanos: 0 },
        deliveryPrice: 410,
      })
    ).toBe(410)
    expect(
      extractOzonAmount({
        splits: [
          {
            delivery_method: {
              price: { currency_code: "RUB", units: "390", nanos: "0" },
            },
          },
        ],
      })
    ).toBe(390)
  })

  it("reads protojson Money with currencyCode or units only", () => {
    expect(
      extractOzonAmount({
        splits: [
          {
            delivery_method: {
              price: { currencyCode: "RUB", units: "250", nanos: "0" },
            },
          },
        ],
      })
    ).toBe(250)
    expect(
      extractOzonAmount({
        delivery_method: { price: { units: "180", nanos: 0 } },
      })
    ).toBe(180)
  })
})

describe("ozonCartArticle", () => {
  it("uses the variant sku from the bridge", () => {
    expect(
      ozonCartArticle({ id: "orli_1", variant: { sku: "GE57" } })
    ).toBe("GE57")
  })

  it("reads variant_sku from the order line snapshot", () => {
    expect(
      ozonCartArticle({ id: "ordli_1", title: "Фигурка", variant_sku: "GE57" })
    ).toBe("GE57")
  })

  it("does not send a medusa line id as an ozon article", () => {
    expect(ozonCartArticle({ id: "orli_1", title: "Varesa" })).toBe("")
    expect(
      ozonCartArticle({ id: "ordli_1", variant: { sku: "ordli_1" } })
    ).toBe("")
  })
})

describe("ozonOrderItemsFromLines", () => {
  it("takes offer_id from the order snapshot, not the line id", () => {
    expect(
      ozonOrderItemsFromLines(
        [
          {
            id: "ordli_1",
            title: "Фигурка",
            quantity: 2,
            unit_price: 640,
            variant_sku: "GE57",
          },
        ],
        (value) => Number(value) || 0
      )
    ).toEqual([
      {
        article: "GE57",
        name: "Фигурка",
        quantity: 2,
        price: 640,
      },
    ])
  })

  it("uses the paid line total after a promo, not the catalog unit price", () => {
    expect(ozonPaidUnitPrice({ quantity: 2, unit_price: 1000, total: 1600 }, (value) => Number(value) || 0)).toBe(800)
    expect(
      ozonOrderItemsFromLines(
        [
          {
            title: "Фигурка",
            quantity: 1,
            unit_price: 1500,
            total: 1200,
            variant_sku: "FI3",
          },
        ],
        (value) => Number(value) || 0
      )[0].price
    ).toBe(1200)
  })
})

describe("applyOzonPaidGoodsTotal", () => {
  it("scales line prices to the paid goods total", () => {
    expect(
      applyOzonPaidGoodsTotal(
        [
          { article: "A", name: "A", quantity: 1, price: 1000 },
          { article: "B", name: "B", quantity: 1, price: 1000 },
        ],
        1800
      )
    ).toEqual([
      { article: "A", name: "A", quantity: 1, price: 900 },
      { article: "B", name: "B", quantity: 1, price: 900 },
    ])
  })
})

describe("hydrateOzonLineItems", () => {
  it("fills sku from the product catalog when the order line has no snapshot", async () => {
    const items = await ozonOrderItemsForCreate(
      [
        {
          id: "ordli_1",
          title: "Фигурка",
          quantity: 1,
          unit_price: 640,
          variant_id: "variant_01ABC",
        },
      ],
      (value) => Number(value) || 0,
      async () => [{ id: "variant_01ABC", sku: "GE57" }]
    )
    expect(items).toEqual([
      {
        article: "GE57",
        name: "Фигурка",
        quantity: 1,
        price: 640,
      },
    ])
    expect(
      hydrateOzonLineItems(
        [{ variant_id: "variant_01ABC", title: "Фигурка" }],
        [{ id: "variant_01ABC", sku: "GE57" }]
      )[0]
    ).toMatchObject({
      variant: { sku: "GE57" },
    })
  })
})

describe("ozonCheckoutItems", () => {
  it("sends offer_id and quantity on the item", () => {
    expect(
      ozonCheckoutItems([{ article: "GE57", quantity: 2 }])
    ).toEqual([
      {
        offer_id: "GE57",
        quantity: 2,
      },
    ])
  })

  it("sends either offer_id or sku, not both", () => {
    expect(
      ozonCheckoutItems([{ article: "FI3", quantity: 1, sku: 2453677444 }])
    ).toEqual([
      {
        offer_id: "FI3",
        quantity: 1,
      },
    ])
  })

  it("sends sku when there is no offer_id", () => {
    expect(
      ozonCheckoutItems([{ quantity: 1, sku: 987 }])
    ).toEqual([
      {
        sku: 987,
        quantity: 1,
      },
    ])
  })

  it("drops items without a real offer_id or sku", () => {
    expect(
      ozonCheckoutItems([
        { article: "ordli_1", quantity: 1 },
        { article: "", quantity: 1 },
        { article: "sku", quantity: 1 },
      ])
    ).toEqual([])
  })
})

describe("quoteOzonDelivery", () => {
  const fetchFn = global.fetch

  afterEach(() => {
    global.fetch = fetchFn
    resetOzonAppTokenCache()
  })

  function jsonResponse(payload: unknown, status = 200) {
    const text = JSON.stringify(payload)
    return {
      ok: status >= 200 && status < 300,
      status,
      headers: { get: () => "application/json" },
      arrayBuffer: async () => Buffer.from(text),
      text: async () => text,
    }
  }

  const sellerInput = {
    creds: {
      clientId: "app-uuid",
      clientSecret: "app-secret",
      refreshToken: "refresh-1",
      fromPlaceId: "555",
      accessToken: "",
    },
    point: { id: "77" },
    phone: "+7 (999) 123-45-67",
    items: [{ article: "WA150", quantity: 1, price: 1500 }],
  }

  function mockOzon(
    handler: (path: string, init?: RequestInit) => ReturnType<typeof jsonResponse>
  ) {
    global.fetch = jest.fn(async (url: string | URL, init?: RequestInit) => {
      const path = String(url)
      if (path.includes("/oauth/token")) {
        return jsonResponse({ access_token: "aaa.bbb.ccc", expires_in: 3600 })
      }
      return handler(path, init)
    }) as typeof fetch
  }

  it("exchanges the app secret and quotes pickup via checkout", async () => {
    mockOzon((path) => {
      if (path.includes("/v2/delivery/checkout")) {
        return jsonResponse({ amount: 320 })
      }
      return jsonResponse({ message: path }, 404)
    })
    await expect(quoteOzonDelivery(sellerInput)).resolves.toBe(320)
    const calls = (global.fetch as jest.Mock).mock.calls
    expect(String(calls[0][0])).toBe("https://xapi.ozon.ru/oauth/token")
    const checkout = calls.find((call) =>
      String(call[0]).includes("/v2/delivery/checkout")
    )
    expect(checkout[1].headers.Authorization).toBe("Bearer aaa.bbb.ccc")
    expect(
      Object.keys(checkout[1].headers).some((key) =>
        /client-id|api-key/i.test(key)
      )
    ).toBe(false)
    expect(
      calls.some((call) => String(call[0]).includes("/v1/delivery/calculate"))
    ).toBe(false)
  })

  it("sends offer_id on checkout items", async () => {
    mockOzon((path) => {
      if (path.includes("/v2/delivery/checkout")) {
        return jsonResponse({ amount: 320 })
      }
      return jsonResponse({ message: path }, 404)
    })
    await quoteOzonDelivery(sellerInput)
    const checkout = (global.fetch as jest.Mock).mock.calls.find((call) =>
      String(call[0]).includes("/v2/delivery/checkout")
    )
    expect(JSON.parse(String(checkout[1].body)).items).toEqual([
      {
        offer_id: "WA150",
        quantity: 1,
      },
    ])
    expect(JSON.parse(String(checkout[1].body)).from_place_id).toBeUndefined()
  })

  it("puts a catalog sku into checkout item id", async () => {
    mockOzon((path) => {
      if (path.includes("/product/info/list")) {
        return jsonResponse({ items: [{ offer_id: "WA150", sku: 987 } ] })
      }
      if (path.includes("/v2/delivery/checkout")) {
        return jsonResponse({ amount: 320 })
      }
      return jsonResponse({ message: path }, 404)
    })
    await quoteOzonDelivery(sellerInput)
    const checkout = (global.fetch as jest.Mock).mock.calls.find((call) =>
      String(call[0]).includes("/v2/delivery/checkout")
    )
    expect(JSON.parse(String(checkout[1].body)).items[0]).toEqual({
      offer_id: "WA150",
      quantity: 1,
    })
    const catalog = (global.fetch as jest.Mock).mock.calls.find((call) =>
      String(call[0]).includes("/v3/product/info/list")
    )
    expect(JSON.parse(String(catalog[1].body))).toEqual({ offer_id: ["WA150"] })
  })

  it("tries FBO checkout when FBS has no tariff", async () => {
    mockOzon((path, init) => {
      const body = String(init?.body || "")
      if (path.includes("/v2/delivery/checkout")) {
        if (body.includes('"FBO"')) return jsonResponse({ amount: 410 })
        return jsonResponse({ splits: [] })
      }
      return jsonResponse({ message: path }, 404)
    })
    await expect(quoteOzonDelivery(sellerInput)).resolves.toBe(410)
  })

  it("creates an order with a mapped pickup timeslot", async () => {
    let createRequestStarted = false
    mockOzon((path) => {
      if (path.includes("/product/info/list")) {
        return jsonResponse({ items: [{ offer_id: "WA150", sku: 987 }] })
      }
      if (path.includes("/v2/delivery/checkout")) {
        return jsonResponse({
          splits: [
            {
              warehouse_id: 555,
              delivery_schema: "FBS",
              delivery_method: {
                id: 42,
                delivery_type: "PVZ",
                timeslots: [
                  {
                    timeslot_id: 9,
                    logistic_date_range: {
                      from: "2026-09-18T08:00:00Z",
                      to: "2026-09-18T16:00:00Z",
                    },
                  },
                ],
              },
              items: [{ offer_id: "WA150", sku: 987, quantity: 1 }],
            },
          ],
        })
      }
      if (path.includes("/v2/order/create")) {
        expect(createRequestStarted).toBe(true)
        return jsonResponse({ order_number: "123-456", posting_number: ["123-456-1"] })
      }
      return jsonResponse({ message: path }, 404)
    })
    await expect(
      createOzonDeliveryOrder({
        creds: sellerInput.creds,
        orderNumber: "shop-1",
        buyer: { name: "Иван Петров", phone: sellerInput.phone },
        point: { id: "77", address: "Тверская 1" },
        amount: 1850,
        shippingTotal: 350,
        items: [{ article: "WA150", name: "Фигурка", quantity: 1, price: 1500 }],
        onCreateRequestStart: async () => {
          await Promise.resolve()
          createRequestStarted = true
        },
      })
    ).resolves.toMatchObject({ order_number: "123-456" })
    expect(createRequestStarted).toBe(true)
    const create = (global.fetch as jest.Mock).mock.calls.find((call) =>
      String(call[0]).includes("/v2/order/create")
    )
    expect(JSON.parse(String(create[1].body))).toMatchObject({
      delivery_schema: "FBS",
      delivery: { pick_up: { map_point_id: 77 } },
      recipient: { recipient_phone: "79991234567" },
      splits: [
        {
          warehouse_id: 555,
          delivery_method: {
            delivery_method_id: 42,
            delivery_type: "PVZ",
            timeslot_id: 9,
            logistic_date_range: {
              from: "2026-09-18T08:00:00Z",
              to: "2026-09-18T16:00:00Z",
            },
            price: { currency_code: "RUB", units: 350 },
          },
          items: [
            {
              offer_id: "WA150",
              quantity: 1,
              price: { currency_code: "RUB", units: 1500 },
            },
          ],
        },
      ],
    })
    expect(JSON.parse(String(create[1].body)).splits[0].items[0]).not.toHaveProperty(
      "sku"
    )
  })

  it("does not call ozon when line items have no offer_id or sku", async () => {
    global.fetch = jest.fn() as typeof fetch
    await expect(
      createOzonDeliveryOrder({
        creds: sellerInput.creds,
        orderNumber: "10",
        buyer: { name: "Иван Петров", phone: sellerInput.phone },
        point: { id: "77", address: "Тверская 1" },
        amount: 1500,
        items: [{ article: "ordli_1", name: "Фигурка", quantity: 1, price: 1500 }],
      })
    ).rejects.toThrow(/нет sku\/offer_id/)
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it("keeps the full checkout body on an ozon 400", async () => {
    mockOzon((path) => {
      if (path.includes("/v2/delivery/checkout")) {
        return jsonResponse(
          {
            code: 3,
            message: "either sku or offer_id should be specified for each item",
          },
          400
        )
      }
      return jsonResponse({ message: path }, 404)
    })
    const error = await createOzonDeliveryOrder({
      creds: sellerInput.creds,
      orderNumber: "8272031168",
      buyer: { name: "Иван Петров", phone: sellerInput.phone },
      point: { id: "77", address: "Тверская 1" },
      amount: 1500,
      items: [{ article: "WA150", name: "Фигурка", quantity: 1, price: 1500 }],
    }).catch((caught) => caught)
    const requests = ozonRequestsOf(error)
    expect(requests.map((row) => row.path)).toEqual([
      "/v2/delivery/checkout",
      "/v2/delivery/checkout",
    ])
    expect(requests[0]?.body).toMatchObject({
      delivery_schema: "FBS",
      buyer_phone: "79991234567",
      delivery_type: { pick_up: { map_point_id: 77 } },
      items: [{ offer_id: "WA150", quantity: 1 }],
    })
    expect(requests[0]?.body).not.toHaveProperty("from_place_id")
    expect(requests[0]?.body.items[0]).not.toHaveProperty("sku")
    expect(requests[1]?.body).toMatchObject({ delivery_schema: "FBO" })
    expect(JSON.stringify(error.ozonRequests || requests, null, 2)).toContain(
      "offer_id"
    )
  })

  it("keeps both checkout responses when neither schema has a timeslot", async () => {
    mockOzon((path, init) => {
      if (path.includes("/product/info/list")) {
        return jsonResponse({ items: [{ offer_id: "WA150", sku: 987 }] })
      }
      if (path.includes("/v2/delivery/checkout")) {
        const request = JSON.parse(String(init?.body || "{}"))
        return jsonResponse({
          splits: [
            {
              delivery_schema: request.delivery_schema,
              warehouse_id: 555,
              delivery_methods: [
                {
                  delivery_method_id: 42,
                  unavailable_reason: "NO_AVAILABLE_TIMESLOT",
                  timeslots: [],
                },
              ],
            },
          ],
        })
      }
      return jsonResponse({ message: path }, 404)
    })

    const error = await createOzonDeliveryOrder({
      creds: sellerInput.creds,
      orderNumber: "shop-1",
      buyer: { name: "Иван Петров", phone: sellerInput.phone },
      point: { id: "77", address: "Тверская 1" },
      amount: 1500,
      items: [{ article: "WA150", name: "Фигурка", quantity: 1, price: 1500 }],
    }).catch((caught) => caught as Error & { ozonCheckoutResponses?: unknown[] })

    expect(error.ozonCheckoutResponses).toHaveLength(2)
    expect(JSON.stringify(error.ozonCheckoutResponses)).toContain(
      "NO_AVAILABLE_TIMESLOT"
    )
    expect(JSON.stringify(error.ozonCheckoutResponses)).toContain('"schema":"FBS"')
    expect(JSON.stringify(error.ozonCheckoutResponses)).toContain('"schema":"FBO"')
  })
})

describe("ozonQuoteErrorMessage", () => {
  it("explains a forbidden seller checkout", () => {
    expect(
      ozonQuoteErrorMessage(
        new Error('checkout FBS: Ozon HTTP 403: {"code":7,"message":"method is not allowed"}')
      )
    ).toMatch(/доставку|пункты/i)
  })

  it("explains an oauth-client token", () => {
    expect(
      ozonQuoteErrorMessage(
        new Error(
          'Ozon HTTP 403: {"code":7,"message":"token must be issued for seller, not oauth-client"}'
        )
      )
    ).toMatch(/доставку|пункты/i)
  })

  it("explains a missing delivery service on the app", () => {
    expect(
      ozonQuoteErrorMessage(
        new Error('Ozon HTTP 403: {"code":7,"message":"no access for this service"}')
      )
    ).toMatch(/доставку|пункты/i)
  })

  it("explains an invalid refresh token without Ozon jargon", () => {
    const message = ozonQuoteErrorMessage(
      new Error(
        'Ozon HTTP 400: {"code":3, "message":"invalid_refresh_token", "details":[]}'
      )
    )
    expect(message).toMatch(/доставку|пункты/i)
    expect(message).not.toMatch(/invalid_refresh_token|HTTP 400|code|JSON|\{/i)
  })

  it("never returns Ozon JSON or HTTP status to the shopper", () => {
    const message = ozonQuoteErrorMessage(
      new Error('Ozon HTTP 400: {"code":9,"message":"unexpected_blob"}')
    )
    expect(message).toMatch(/[А-Яа-яЁё]/)
    expect(message).not.toMatch(/HTTP \d+|unexpected_blob|\{|"code"/i)
  })

  it("never tells the shopper to connect the seller cabinet", () => {
    const message = ozonQuoteErrorMessage(
      new Error("Подключите кабинет продавца Ozon в настройках магазина.")
    )
    expect(message).toMatch(/пункты выдачи|доставку/)
    expect(message).not.toMatch(/кабинет|настройках/i)
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

  it("reads postings array from order create", () => {
    expect(
      extractOzonCreateIds({
        order_number: "123-456",
        postings: ["123-456-1"],
      })
    ).toMatchObject({
      orderNumber: "123-456",
      postingNumber: "123-456-1",
    })
  })

  it("reads nested seller result.posting_number", () => {
    expect(
      extractOzonCreateIds({
        result: { order_number: "99-1", posting_number: "99-1-1" },
      })
    ).toMatchObject({
      orderNumber: "99-1",
      postingNumber: "99-1-1",
    })
  })
})

describe("parseOzonPostingNumbers", () => {
  it("reads v4 posting list numbers", () => {
    expect(
      parseOzonPostingNumbers({
        postings: [{ posting_number: "123-456-1" }, { posting_number: "123-456-2" }],
      })
    ).toEqual(["123-456-1", "123-456-2"])
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
    resetOzonPvzCache()
  })

  it("loads clustered buckets when the map is zoomed out", async () => {
    const payload = {
      clusters: [
        {
          points_count: 40,
          coordinate: { lat: 55.7, long: 37.6 },
          viewport: {
            left_bottom: { lat: 55.5, long: 37.4 },
            right_top: { lat: 55.9, long: 37.8 },
          },
        },
      ],
    }
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => "application/json" },
      arrayBuffer: async () => Buffer.from(JSON.stringify(payload)),
    })
    const result = await loadOzonPoints(
      { ozon_client_id: "app-uuid", ozon_oauth_token: "aaa.bbb.ccc" },
      { zoom: 5, south: 50, west: 20, north: 70, east: 50 }
    )
    expect(result.points).toEqual([])
    expect(result.clusters?.[0]?.count).toBe(40)
    expect(result.message).toMatch(/цифру/)
    const body = JSON.parse(String((global.fetch as jest.Mock).mock.calls[0][1].body))
    expect(body.viewport).toEqual(
      ozonMapViewport({ south: 50, west: 20, north: 70, east: 50 })
    )
    expect(body.viewport.left_bottom.lat).toBe(50)
    expect(body.viewport.left_bottom.long).toBe(20)
  })

  it("loads pins from map_point_ids when zoomed in", async () => {
    global.fetch = jest.fn(async (url: string | URL) => {
      const path = String(url)
      const payload = path.includes("/delivery/point/info")
        ? {
            points: [
              {
                enabled: true,
                delivery_method: {
                  map_point_id: 77,
                  name: "ПВЗ Тверская",
                  address: "Тверская 1",
                  coordinates: { lat: 55.76, long: 37.61 },
                },
              },
            ],
          }
        : {
            clusters: [
              {
                points_count: 1,
                map_point_ids: ["77"],
                coordinate: { lat: 55.76, long: 37.61 },
              },
            ],
          }
      return {
        ok: true,
        headers: { get: () => "application/json" },
        arrayBuffer: async () => Buffer.from(JSON.stringify(payload)),
      }
    }) as typeof fetch
    const result = await loadOzonPoints(
      { ozon_client_id: "app-uuid", ozon_oauth_token: "aaa.bbb.ccc" },
      { zoom: 16, south: 55.7, west: 37.5, north: 55.8, east: 37.7 }
    )
    expect(result.points).toEqual([
      expect.objectContaining({
        id: "77",
        name: "ПВЗ Тверская",
        address: "Тверская 1",
        lat: 55.76,
        lon: 37.61,
      }),
    ])
    const info = (global.fetch as jest.Mock).mock.calls.find((call) =>
      String(call[0]).includes("/delivery/point/info")
    )
    expect(JSON.parse(String(info[1].body))).toEqual({ map_point_ids: ["77"] })
  })

  it("does not call Ozon when the cabinet is not connected", async () => {
    global.fetch = jest.fn()
    const result = await loadOzonPoints(
      { ozon_client_id: "app-uuid", ozon_oauth_token: "app-secret" },
      { zoom: 12, south: 50, west: 20, north: 70, east: 50 }
    )
    expect(global.fetch).not.toHaveBeenCalled()
    expect(result.configured).toBe(false)
    expect(result.points).toEqual([])
    expect(result.message).toBe("Не удалось загрузить пункты выдачи.")
    expect(result.message).not.toMatch(/кабинет|настройках/i)
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
    expect(result.message).toMatch(/пункты выдачи/)
  })

  it("reuses cached pickup points when the map only zooms a little", async () => {
    const payload = {
      clusters: [
        {
          points_count: 12,
          coordinate: { lat: 55.75, long: 37.62 },
          viewport: {
            left_bottom: { lat: 55.6, long: 37.4 },
            right_top: { lat: 55.9, long: 37.8 },
          },
        },
      ],
    }
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => "application/json" },
      arrayBuffer: async () => Buffer.from(JSON.stringify(payload)),
    })
    const row = {
      ozon_client_id: "app-uuid",
      ozon_oauth_token: "aaa.bbb.ccc",
    }
    const view = { south: 55.61, west: 37.41, north: 55.89, east: 37.79 }
    await loadOzonPoints(row, { ...view, zoom: 10 })
    await loadOzonPoints(row, { ...view, zoom: 11.4 })
    const ozonCalls = (global.fetch as jest.Mock).mock.calls.filter((call) =>
      String(call[0]).includes("api-seller.ozon.ru")
    )
    expect(ozonCalls).toHaveLength(1)
  })

  it("asks Ozon for longitude strips when the map is zoomed far out", async () => {
    const payload = {
      clusters: [
        {
          points_count: 8,
          coordinate: { lat: 55.7, long: 37.6 },
        },
      ],
    }
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => "application/json" },
      arrayBuffer: async () => Buffer.from(JSON.stringify(payload)),
    })
    await loadOzonPoints(
      { ozon_client_id: "app-uuid", ozon_oauth_token: "aaa.bbb.ccc" },
      { zoom: 4, south: 40, west: 20, north: 75, east: 140 }
    )
    const mapCalls = (global.fetch as jest.Mock).mock.calls.filter((call) =>
      String(call[0]).includes("/v1/delivery/map")
    )
    expect(mapCalls.length).toBeGreaterThan(1)
    const wests = mapCalls.map(
      (call) => JSON.parse(String(call[1].body)).viewport.left_bottom.long
    )
    expect(Math.min(...wests)).toBe(20)
    expect(Math.max(...wests)).toBeGreaterThan(50)
  })
})
