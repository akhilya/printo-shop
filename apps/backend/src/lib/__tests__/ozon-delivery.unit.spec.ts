import {
  clusterOzonPoints,
  extractOzonAmount,
  extractOzonCreateIds,
  loadOzonPoints,
  nearestOzonPoints,
  normalizeOzonPhone,
  ozonOrderContacts,
  ozonPackErrorMessage,
  ozonCredsFromRow,
  ozonTrackingUrl,
  parseOzonClusters,
  parseOzonPoints,
  pointsInBounds,
  quoteOzonDelivery,
  ozonQuoteErrorMessage,
  ozonCartArticle,
  ozonCheckoutItems,
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

  it("does not send a medusa line id as an ozon article", () => {
    expect(ozonCartArticle({ id: "orli_1", title: "Varesa" })).toBe("")
  })
})

describe("ozonCheckoutItems", () => {
  it("sends offer_id on the item, not under id", () => {
    expect(
      ozonCheckoutItems([{ article: "GE57", quantity: 2 }])
    ).toEqual([
      {
        offer_id: "GE57",
        quantity: 2,
      },
    ])
    expect(ozonCheckoutItems([{ article: "GE57", quantity: 2 }])[0]).not.toHaveProperty(
      "id"
    )
  })

  it("adds a catalog sku next to offer_id", () => {
    expect(
      ozonCheckoutItems([{ article: "GE57", quantity: 1, sku: 987 }])
    ).toEqual([
      {
        offer_id: "GE57",
        sku: 987,
        quantity: 1,
      },
    ])
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
    expect(JSON.parse(String(checkout[1].body)).from_place_id).toBe(555)
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
      sku: 987,
      quantity: 1,
    })
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
})
