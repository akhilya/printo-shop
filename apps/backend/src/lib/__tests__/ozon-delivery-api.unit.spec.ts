import {
  createOzonDeliveryApiOrder,
  listOzonDeliveryApiPoints,
  listOzonDeliveryApiShipmentMethods,
  matchOzonDeliveryApiPoint,
  matchOzonDeliveryApiPointWithDiagnostics,
  ozonDeliveryApiConfigFromRow,
  quoteOzonDeliveryApi,
  resetOzonDeliveryApiCache,
} from "../ozon-delivery-api"

const originalFetch = global.fetch

const config = {
  clientId: "delivery-client",
  clientSecret: "delivery-secret",
  shipmentMethodId: 42,
  parcel: {
    weightG: 1200,
    lengthMm: 200,
    widthMm: 150,
    heightMm: 100,
  },
}

function jsonResponse(body: unknown, status = 200, headers?: HeadersInit) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  })
}

const pointInfo = {
  delivery_points: [
    {
      delivery_point_id: 77,
      name: "ПВЗ Москва Ленина",
      full_address: "г. Москва, ул. Ленина, д. 1",
      coordinates: { latitude: 55.75, longitude: 37.61 },
      is_active: true,
    },
  ],
}

describe("Ozon Delivery API settings", () => {
  it("requires credentials, method id, and all parcel dimensions", () => {
    expect(
      ozonDeliveryApiConfigFromRow({
        ozon_delivery_client_id: "delivery-client",
        ozon_delivery_client_secret: "delivery-secret",
        ozon_delivery_shipment_method_id: "42",
        ozon_delivery_weight_g: "1200",
        ozon_delivery_length_mm: "200",
        ozon_delivery_width_mm: "150",
        ozon_delivery_height_mm: "100",
      })
    ).toEqual(config)
    expect(
      ozonDeliveryApiConfigFromRow({
        ozon_delivery_client_id: "delivery-client",
        ozon_delivery_client_secret: "delivery-secret",
        ozon_delivery_shipment_method_id: "42",
      })
    ).toBeNull()
  })
})

describe("Ozon Delivery API requests", () => {
  afterEach(() => {
    global.fetch = originalFetch
    resetOzonDeliveryApiCache()
    jest.restoreAllMocks()
  })

  it("refreshes tokens when Ozon returns an absolute Unix expiry", async () => {
    const now = 1_800_000_000_000
    const dateNow = jest.spyOn(Date, "now").mockReturnValue(now)
    const emptyMethods = { shipment_methods: [], next_cursor: "" }
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          access_token: "delivery-token-1",
          expires_in: Math.floor(now / 1000) + 900,
        })
      )
      .mockResolvedValueOnce(jsonResponse(emptyMethods))
      .mockResolvedValueOnce(
        jsonResponse({ access_token: "delivery-token-2", expires_in: 3600 })
      )
      .mockResolvedValueOnce(jsonResponse(emptyMethods))
    global.fetch = fetchMock as typeof fetch

    await listOzonDeliveryApiShipmentMethods({
      clientId: config.clientId,
      clientSecret: config.clientSecret,
    })
    dateNow.mockReturnValue(now + 700_000)
    await listOzonDeliveryApiShipmentMethods({
      clientId: config.clientId,
      clientSecret: config.clientSecret,
    })

    const tokenRequests = fetchMock.mock.calls.filter(([url]) =>
      String(url).endsWith("/oauth/token")
    )
    expect(tokenRequests).toHaveLength(2)
    expect(fetchMock.mock.calls[1][1]?.headers).toMatchObject({
      Authorization: "Bearer delivery-token-1",
    })
    expect(fetchMock.mock.calls[3][1]?.headers).toMatchObject({
      Authorization: "Bearer delivery-token-2",
    })
  })

  it("refreshes and retries once when a Delivery API request returns 401", async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ access_token: "expired-token", expires_in: 3600 })
      )
      .mockResolvedValueOnce(jsonResponse({ code: "UNAUTHORIZED" }, 401))
      .mockResolvedValueOnce(
        jsonResponse({ access_token: "fresh-token", expires_in: 3600 })
      )
      .mockResolvedValueOnce(
        jsonResponse({ shipment_methods: [], next_cursor: "" })
      )
    global.fetch = fetchMock as typeof fetch

    await expect(
      listOzonDeliveryApiShipmentMethods({
        clientId: config.clientId,
        clientSecret: config.clientSecret,
      })
    ).resolves.toEqual([])

    const apiRequests = fetchMock.mock.calls.filter(([url]) =>
      String(url).endsWith("/v1/shipment-method/search")
    )
    expect(apiRequests).toHaveLength(2)
    expect(apiRequests[0][1]?.headers).toMatchObject({
      Authorization: "Bearer expired-token",
    })
    expect(apiRequests[1][1]?.headers).toMatchObject({
      Authorization: "Bearer fresh-token",
    })
  })

  it("uses the Delivery API OAuth scopes and persists the idempotency key", async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ access_token: "delivery-token", expires_in: 3600 })
      )
      .mockResolvedValueOnce(jsonResponse(pointInfo))
      .mockResolvedValueOnce(
        jsonResponse({
          results: [
            {
              request_id: 1,
              posting: {
                cutoff_at: "2026-10-30T15:00:00Z",
                estimated_delivery_cost: {
                  amount: "450.00",
                  currency_code: "RUB",
                },
              },
            },
          ],
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          order_number: "YY-123",
          postings: [
            {
              posting_number: "123BE456PY78-90YY",
              posting_external_id: "shop-order-42-1",
            },
          ],
        })
      )
    global.fetch = fetchMock as typeof fetch

    await expect(
      createOzonDeliveryApiOrder({
        config,
        idempotencyKey: "f7842533-0650-4be9-a2cc-964093fe70f0",
        orderExternalId: "shop-order-42",
        postingExternalId: "shop-order-42-1",
        buyer: { name: "Иван Иванов", phone: "+79991234567" },
        pointId: "77",
        description: "Индивидуальный заказ",
        declaredValue: 1500,
      })
    ).resolves.toMatchObject({
      orderNumber: "YY-123",
      postingNumber: "123BE456PY78-90YY",
      status: "created",
    })

    expect(String(fetchMock.mock.calls[0][0])).toBe(
      "https://xapi.ozon.ru/oauth/token"
    )
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toMatchObject({
      grant_type: "client_credentials",
      scope: [
        "delivery-api.delivery",
        "delivery-api.delivery-point",
        "delivery-api.order",
        "delivery-api.posting",
        "delivery-api.shipment-method",
      ],
    })
    expect(String(fetchMock.mock.calls[3][0])).toBe(
      "https://api-delivery.ozon.ru/v1/order/create"
    )
    expect(fetchMock.mock.calls[3][1]?.headers).toMatchObject({
      "Idempotency-Key": "f7842533-0650-4be9-a2cc-964093fe70f0",
      Authorization: "Bearer delivery-token",
    })
    expect(JSON.parse(String(fetchMock.mock.calls[3][1]?.body))).toMatchObject({
      order_external_id: "shop-order-42",
      delivery: { delivery_point: { delivery_point_id: 77 } },
      postings: [
        {
          posting_external_id: "shop-order-42-1",
          shipment_method_id: 42,
          cutoff_at: "2026-10-30T15:00:00Z",
          dimensions: {
            weight_g: 1200,
            length_mm: 200,
            width_mm: 150,
            height_mm: 100,
          },
        },
      ],
    })
  })

  it("repeats a redirected POST with its original body and testcookie", async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ access_token: "delivery-token", expires_in: 3600 })
      )
      .mockResolvedValueOnce(
        new Response("", {
          status: 307,
          headers: {
            Location: "/testcookie/delivery-point/info",
            "Set-Cookie": "testcookie=challenge; Path=/; Secure",
          },
        })
      )
      .mockResolvedValueOnce(jsonResponse(pointInfo))
      .mockResolvedValueOnce(
        jsonResponse({
          results: [
            {
              request_id: 1,
              posting: {
                estimated_delivery_cost: {
                  amount: "450.00",
                  currency_code: "RUB",
                },
              },
            },
          ],
        })
      )
    global.fetch = fetchMock as typeof fetch

    await expect(
      quoteOzonDeliveryApi({
        config,
        pointId: "77",
        phone: "+79991234567",
        declaredValue: 1500,
      })
    ).resolves.toBe(450)

    const firstInfo = fetchMock.mock.calls[1]
    const redirectedInfo = fetchMock.mock.calls[2]
    expect(redirectedInfo[1]?.method).toBe("POST")
    expect(redirectedInfo[1]?.headers).toMatchObject({
      Cookie: "testcookie=challenge",
    })
    expect(redirectedInfo[1]?.body).toBe(firstInfo[1]?.body)
  })

  it("matches a Seller PVZ only by a nearby Delivery API point", async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ access_token: "delivery-token", expires_in: 3600 })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          delivery_points: [
            { delivery_point_id: 77, shipment_method_ids: [42] },
            { delivery_point_id: 78, shipment_method_ids: [42] },
          ],
          next_cursor: "",
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          delivery_points: [
            ...pointInfo.delivery_points,
            {
              delivery_point_id: 78,
              name: "ПВЗ Москва Ленина 2",
              full_address: "г. Москва, ул. Ленина, д. 2",
              coordinates: { latitude: 55.751, longitude: 37.611 },
              is_active: true,
            },
          ],
        })
      )
    global.fetch = fetchMock as typeof fetch

    const match = await matchOzonDeliveryApiPointWithDiagnostics({
      config,
      address: "г. Москва, ул. Ленина, д. 1",
      lat: 55.75,
      lon: 37.61,
    })
    expect(match.point).toMatchObject({ id: "77" })
    expect(match.diagnostics).toMatchObject({
      match_status: "matched_by_location_text",
      shipment_method_id: 42,
      source_location: {
        has_text: true,
        has_latitude: true,
        has_longitude: true,
      },
      delivery_api_point_count: 2,
      nearby_point_count: 2,
      location_text_match_count: 1,
      nearest_points: expect.arrayContaining([
        expect.objectContaining({
          delivery_point_id: "77",
          within_250m: true,
          location_text_matches: true,
        }),
      ]),
    })
    expect(JSON.stringify(match.diagnostics)).not.toContain("Ленина")

    const noMatch = await matchOzonDeliveryApiPointWithDiagnostics({
      config,
      address: "г. Москва, ул. Ленина, д. 1",
      lat: 55.8,
      lon: 37.7,
    })
    expect(noMatch.point).toBeNull()
    expect(noMatch.diagnostics.match_status).toBe("no_points_within_250m")
    expect(noMatch.diagnostics.nearest_points[0].distance_m).toBeGreaterThan(250)
    await expect(
      matchOzonDeliveryApiPoint({
        config,
        address: "г. Москва, ул. Ленина, д. 1",
        lat: 55.8,
        lon: 37.7,
      })
    ).resolves.toBeNull()
  })

  it("requests delivery-point details in batches of at most 100 ids", async () => {
    const firstPageIds = Array.from({ length: 100 }, (_, index) => 10_000 + index)
    const secondPageIds = [20_000]
    const allIds = [...firstPageIds, ...secondPageIds]
    const pointListPage = (ids: number[], nextCursor: string) => ({
      delivery_points: ids.map((delivery_point_id) => ({
        delivery_point_id,
        shipment_method_ids: [config.shipmentMethodId],
      })),
      next_cursor: nextCursor,
    })
    const pointDetails = (ids: number[]) => ({
      delivery_points: ids.map((delivery_point_id) => ({
        delivery_point_id,
        full_address: "г. Москва, ул. Тестовая, д. 1",
        coordinates: { latitude: 55.75, longitude: 37.61 },
        is_active: true,
      })),
    })
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ access_token: "delivery-token", expires_in: 3600 })
      )
      .mockResolvedValueOnce(jsonResponse(pointListPage(firstPageIds, "next")))
      .mockResolvedValueOnce(jsonResponse(pointListPage(secondPageIds, "")))
      .mockResolvedValueOnce(jsonResponse(pointDetails(firstPageIds)))
      .mockResolvedValueOnce(jsonResponse(pointDetails(secondPageIds)))
    global.fetch = fetchMock as typeof fetch

    const points = await listOzonDeliveryApiPoints(config)
    const infoRequests = fetchMock.mock.calls.filter(([url]) =>
      String(url).endsWith("/v1/delivery-point/info")
    )
    const requestedIds = infoRequests.map(([, init]) =>
      (JSON.parse(String(init?.body)) as { delivery_point_ids: number[] })
        .delivery_point_ids
    )

    expect(points).toHaveLength(101)
    expect(requestedIds.map((ids) => ids.length)).toEqual([100, 1])
    expect(requestedIds.flat()).toEqual(allIds)
  })

  it("records safe request details for a Delivery API HTTP error", async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ access_token: "delivery-token", expires_in: 3600 })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          delivery_points: [
            { delivery_point_id: 77, shipment_method_ids: [42] },
          ],
          next_cursor: "",
        })
      )
      .mockResolvedValueOnce(
        jsonResponse(
          {
            error: JSON.stringify({
              code: "INVALID_ARGUMENT",
              message:
                "Invalid input for phone +79991234567; address: ул. Ленина, д. 1; coordinates: 55.7512, 37.6184; client_secret=secret-value",
              stack: "Sensitive stack details must not be retained",
            }),
          },
          400
        )
      )
    global.fetch = fetchMock as typeof fetch

    let caught: unknown
    try {
      await matchOzonDeliveryApiPointWithDiagnostics({
        config,
        lat: 55.75,
        lon: 37.61,
      })
    } catch (error) {
      caught = error
    }

    expect(caught).toMatchObject({
      message: "Ozon Delivery API HTTP 400: INVALID_ARGUMENT",
      ozonDeliveryApiDiagnostics: {
        endpoint: "/v1/delivery-point/info",
        http_status: 400,
        request: {
          fields: ["delivery_point_ids"],
          array_counts: { delivery_point_ids: 1 },
          delivery_point_ids_count: 1,
          delivery_point_ids_sample: ["77"],
        },
        response: {
          error_code: "INVALID_ARGUMENT",
          error_message:
            "Invalid input for phone [redacted]; address=[redacted]; coordinates=[redacted]; client_secret=[redacted]",
        },
      },
    })
    const serializedError = JSON.stringify(caught)
    expect(serializedError).not.toContain("+79991234567")
    expect(serializedError).not.toContain("Ленина")
    expect(serializedError).not.toContain("55.7512")
    expect(serializedError).not.toContain("37.6184")
    expect(serializedError).not.toContain("secret-value")
    expect(serializedError).not.toContain("Sensitive stack details")
  })

  it("lists active shipment methods without exposing Delivery API credentials", async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ access_token: "delivery-token", expires_in: 3600 })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          shipment_methods: [
            {
              shipment_method_id: 42,
              name: "Склад Москва — dropoff",
              status: "active",
              type: { dropoff: { dropoff_point_id: 1234 } },
              full_address: "г. Москва, ул. Ленина, д. 1",
            },
          ],
          next_cursor: "",
        })
      )
    global.fetch = fetchMock as typeof fetch

    await expect(
      listOzonDeliveryApiShipmentMethods({
        clientId: config.clientId,
        clientSecret: config.clientSecret,
      })
    ).resolves.toEqual([
      {
        shipment_method_id: 42,
        name: "Склад Москва — dropoff",
        status: "active",
        type: "dropoff",
        dropoff_point_id: 1234,
        full_address: "г. Москва, ул. Ленина, д. 1",
        error_code: null,
      },
    ])
    expect(String(fetchMock.mock.calls[1][0])).toBe(
      "https://api-delivery.ozon.ru/v1/shipment-method/search"
    )
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toEqual({
      filters: { statuses: ["active"] },
      pagination: { limit: 100 },
    })
  })
})
