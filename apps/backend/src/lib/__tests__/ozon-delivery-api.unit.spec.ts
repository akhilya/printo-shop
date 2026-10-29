import {
  createOzonDeliveryApiOrder,
  matchOzonDeliveryApiPoint,
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

    await expect(
      matchOzonDeliveryApiPoint({
        config,
        address: "г. Москва, ул. Ленина, д. 1",
        lat: 55.75,
        lon: 37.61,
      })
    ).resolves.toMatchObject({ id: "77" })
    await expect(
      matchOzonDeliveryApiPoint({
        config,
        address: "г. Москва, ул. Ленина, д. 1",
        lat: 55.8,
        lon: 37.7,
      })
    ).resolves.toBeNull()
  })
})
