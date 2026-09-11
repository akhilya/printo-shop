export type OzonPoint = {
  id: string
  name: string
  address: string
  lat: number
  lon: number
  schedule?: string
  city?: string
}

export type OzonCreds = {
  clientId: string
  apiKey: string
  fromPlaceId: string
}

export function ozonCredsFromRow(
  row: Record<string, unknown> | null | undefined
): OzonCreds | null {
  if (!row) return null
  const clientId = String(row.ozon_client_id || "").trim()
  const apiKey = String(row.ozon_api_key || "").trim()
  if (!clientId || !apiKey) return null
  return {
    clientId,
    apiKey,
    fromPlaceId: String(row.ozon_from_place_id || "").trim(),
  }
}

export function isOzonRocketCreds(creds: OzonCreds) {
  return /^principal_/i.test(creds.clientId)
}

export function normalizeOzonPhone(phone: string) {
  const digits = String(phone || "").replace(/\D/g, "")
  if (!digits) return ""
  if (digits.length === 11 && digits.startsWith("8")) return `7${digits.slice(1)}`
  if (digits.length === 10) return `7${digits}`
  return digits
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function firstNumber(...values: unknown[]) {
  for (const value of values) {
    if (value == null || value === "") continue
    if (typeof value === "object") continue
    const numeric = Number(value)
    if (Number.isFinite(numeric)) return numeric
  }
  return null
}

function coordLat(coord: unknown) {
  const rec = asRecord(coord)
  return firstNumber(rec?.lat, rec?.latitude, rec?.coord_lat)
}

function coordLon(coord: unknown) {
  const rec = asRecord(coord)
  return firstNumber(
    rec?.lon,
    rec?.lng,
    rec?.longitude,
    rec?.coord_long,
    rec?.long
  )
}

function firstText(...values: unknown[]) {
  for (const value of values) {
    const text = String(value ?? "").trim()
    if (text) return text
  }
  return ""
}

export function parseOzonPoints(raw: unknown): OzonPoint[] {
  const out: OzonPoint[] = []
  const stack: unknown[] = [raw]
  while (stack.length) {
    const cur = stack.pop()
    if (!cur) continue
    if (Array.isArray(cur)) {
      for (const item of cur) stack.push(item)
      continue
    }
    const rec = asRecord(cur)
    if (!rec) continue
    if (rec.points_count != null && rec.map_point_id == null && rec.point_id == null) {
      for (const value of Object.values(rec)) {
        if (value && typeof value === "object") stack.push(value)
      }
      continue
    }
    const coord = rec.coordinate || rec.coordinates || rec.location
    const id =
      rec.id ??
      rec.point_id ??
      rec.map_point_id ??
      rec.delivery_variant_id ??
      rec.code
    const lat = firstNumber(rec.lat, rec.latitude, rec.coord_lat, coordLat(coord))
    const lon = firstNumber(
      rec.lon,
      rec.lng,
      rec.longitude,
      rec.coord_long,
      rec.long,
      coordLon(coord)
    )
    const address = firstText(
      rec.address,
      rec.full_address,
      rec.address_tail,
      rec.address_string,
      rec.point_address
    )
    const name = firstText(
      rec.name,
      rec.title,
      rec.short_name,
      rec.description,
      address
    )
    if (id != null && lat != null && lon != null) {
      out.push({
        id: String(id),
        name: name || address || `Пункт Ozon ${id}`,
        address: address || name || "",
        lat,
        lon,
        schedule: rec.schedule ? String(rec.schedule) : undefined,
        city: firstText(rec.city, rec.settlement, rec.region) || undefined,
      })
      continue
    }
    for (const value of Object.values(rec)) {
      if (value && typeof value === "object") stack.push(value)
    }
  }
  const seen = new Set<string>()
  return out.filter((point) => {
    if (seen.has(point.id)) return false
    seen.add(point.id)
    return true
  })
}

export type OzonBounds = {
  south: number
  west: number
  north: number
  east: number
}

export function nearestOzonPoints(
  points: OzonPoint[],
  center: { lat: number; lon: number },
  limit = 80
) {
  return [...points]
    .sort((a, b) => {
      const da = (a.lat - center.lat) ** 2 + (a.lon - center.lon) ** 2
      const db = (b.lat - center.lat) ** 2 + (b.lon - center.lon) ** 2
      return da - db
    })
    .slice(0, limit)
}

export function pointsInBounds(
  points: OzonPoint[],
  bounds: OzonBounds,
  limit = 200
) {
  const padLat = Math.max((bounds.north - bounds.south) * 0.02, 0.002)
  const padLon = Math.max((bounds.east - bounds.west) * 0.02, 0.002)
  const south = bounds.south - padLat
  const north = bounds.north + padLat
  const west = bounds.west - padLon
  const east = bounds.east + padLon
  return points
    .filter(
      (point) =>
        point.lat >= south &&
        point.lat <= north &&
        point.lon >= west &&
        point.lon <= east
    )
    .slice(0, limit)
}

export function boundsFromCenter(
  center: { lat: number; lon: number },
  delta = 0.12
): OzonBounds {
  return {
    south: center.lat - delta,
    north: center.lat + delta,
    west: center.lon - delta * 1.6,
    east: center.lon + delta * 1.6,
  }
}

export function centerFromBounds(bounds: OzonBounds) {
  return {
    lat: (bounds.south + bounds.north) / 2,
    lon: (bounds.west + bounds.east) / 2,
  }
}

function parseBounds(input: {
  south?: number
  west?: number
  north?: number
  east?: number
}): OzonBounds | null {
  const south = Number(input.south)
  const west = Number(input.west)
  const north = Number(input.north)
  const east = Number(input.east)
  if (
    ![south, west, north, east].every(Number.isFinite) ||
    north <= south ||
    east <= west
  ) {
    return null
  }
  return { south, west, north, east }
}

export function ozonTrackingUrl(orderNumber?: string | null) {
  const id = String(orderNumber || "").trim()
  if (!id) return null
  return `https://www.ozon.ru/my/orderdetails/?order=${encodeURIComponent(id)}`
}

export function extractOzonAmount(raw: unknown): number | null {
  const preferred: number[] = []
  const fallback: number[] = []
  const stack: unknown[] = [raw]
  while (stack.length) {
    const cur = stack.pop()
    if (!cur) continue
    if (Array.isArray(cur)) {
      for (const item of cur) stack.push(item)
      continue
    }
    const rec = asRecord(cur)
    if (!rec) continue
    const units = firstNumber(rec.units)
    const nanos = firstNumber(rec.nanos)
    if (units != null && rec.currency_code) {
      preferred.push(units + (nanos != null ? nanos / 1_000_000_000 : 0))
    }
    const named = firstNumber(
      rec.delivery_price,
      rec.deliveryPrice,
      rec.tariff,
      rec.delivery_cost,
      rec.deliveryCost
    )
    if (named != null && named >= 0) preferred.push(named)
    for (const [key, value] of Object.entries(rec)) {
      if (value && typeof value === "object") {
        stack.push(value)
        continue
      }
      if (!/^(amount|price|cost)$/i.test(key)) continue
      const numeric = firstNumber(value)
      if (numeric != null && numeric >= 0) fallback.push(numeric)
    }
  }
  const picked = preferred[0] ?? fallback[0]
  if (picked == null || !Number.isFinite(picked) || picked < 0) return null
  const amount = picked > 100_000 ? picked / 100 : picked
  return Math.round(amount)
}

async function rocketVariantId(
  token: string,
  point: { id: string; lat?: number; lon?: number }
) {
  if (!Number.isFinite(point.lat) || !Number.isFinite(point.lon)) {
    return point.id
  }
  try {
    const raw = await rocketRequest(token, "GET", "/v1/delivery/variants")
    const variants = parseOzonPoints(raw)
    const sameId = variants.find((row) => row.id === String(point.id))
    if (sameId) return sameId.id
    const nearest = nearestOzonPoints(
      variants,
      { lat: Number(point.lat), lon: Number(point.lon) },
      1
    )[0]
    return nearest?.id || point.id
  } catch {
    return point.id
  }
}

export async function quoteOzonDelivery(input: {
  creds: OzonCreds
  point: { id: string; address?: string; lat?: number; lon?: number }
  phone?: string
  items: Array<{ article: string; quantity: number; price: number }>
}) {
  if (!input.creds.fromPlaceId || !input.point.id) return null
  const declared = Math.max(
    1,
    Math.round(
      input.items.reduce(
        (sum, item) => sum + item.price * item.quantity,
        0
      )
    )
  )
  const token = await rocketToken(input.creds)
  const variantId = await rocketVariantId(token, input.point)
  const params = new URLSearchParams({
    deliveryVariantId: String(variantId),
    fromPlaceId: input.creds.fromPlaceId,
    weight: "500",
    estimatedCost: String(declared),
  })
  try {
    const raw = await rocketRequest(
      token,
      "GET",
      `/v1/delivery/calculate?${params.toString()}`
    )
    const amount = extractOzonAmount(raw)
    if (amount != null) return amount
  } catch {
    // Some cabinets only accept POST.
  }
  const raw = await rocketRequest(token, "POST", "/v1/delivery/calculate", {
    deliveryVariantId: variantId,
    fromPlaceId: input.creds.fromPlaceId,
    weight: 500,
    estimatedCost: declared,
  })
  return extractOzonAmount(raw)
}

export function extractOzonCreateIds(raw: unknown) {
  const rec = asRecord(raw) || {}
  const nested = JSON.stringify(raw ?? {})
  const orderNumber =
    firstText(rec.order_number, rec.orderNumber) ||
    (nested.match(/"order_number"\s*:\s*"([^"]+)"/i) || [])[1] ||
    ""
  const postingRaw = rec.posting_number ?? rec.postingNumber ?? rec.postings
  const posting =
    firstText(
      Array.isArray(postingRaw) ? postingRaw[0] : postingRaw
    ) || (nested.match(/"posting_number"\s*:\s*"([^"]+)"/i) || [])[1] ||
    ""
  return {
    orderNumber: orderNumber || null,
    postingNumber: posting || null,
    trackingUrl: ozonTrackingUrl(orderNumber),
  }
}

async function readJson(response: Response) {
  const text = await response.text()
  let json: unknown = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = { raw: text }
  }
  if (!response.ok) {
    throw new Error(`Ozon HTTP ${response.status}: ${text.slice(0, 240)}`)
  }
  return json
}

async function sellerPost(
  creds: OzonCreds,
  path: string,
  body: Record<string, unknown>
) {
  const response = await fetch(`https://api-seller.ozon.ru${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Client-Id": creds.clientId,
      "Api-Key": creds.apiKey,
    },
    body: JSON.stringify(body),
  })
  return readJson(response)
}

async function rocketToken(creds: OzonCreds) {
  const response = await fetch(
    "https://xapi.ozon.ru/principal-auth-api/connect/token",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: creds.clientId,
        client_secret: creds.apiKey,
      }),
    }
  )
  const json = (await readJson(response)) as { access_token?: string }
  const token = String(json.access_token || "").trim()
  if (!token) throw new Error("Ozon Rocket: нет access_token")
  return token
}

async function rocketRequest(
  token: string,
  method: string,
  path: string,
  body?: Record<string, unknown>
) {
  const response = await fetch(
    `https://xapi.ozon.ru/principal-integration-api${path}`,
    {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    }
  )
  return readJson(response)
}

export async function geocodeCity(city: string) {
  const query = city.trim()
  if (!query) return null
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=ru&q=${encodeURIComponent(query)}`
  const res = await fetch(url, {
    headers: { "User-Agent": "printo-shop/1.0 (ozon-pvz)" },
  })
  if (!res.ok) return null
  const rows = (await res.json()) as Array<{ lat: string; lon: string }>
  const first = rows[0]
  if (!first) return null
  return { lat: Number(first.lat), lon: Number(first.lon) }
}

async function enrichSellerPoints(creds: OzonCreds, points: OzonPoint[]) {
  const ids = points.map((point) => point.id).slice(0, 100)
  if (!ids.length) return points
  try {
    const raw = await sellerPost(creds, "/v1/delivery/point/info", {
      map_point_ids: ids.map((id) => Number(id) || id),
      ids,
    })
    const details = parseOzonPoints(raw)
    if (!details.length) return points
    const byId = new Map(details.map((point) => [point.id, point]))
    return points.map((point) => {
      const extra = byId.get(point.id)
      if (!extra) return point
      return {
        ...point,
        name: extra.name || point.name,
        address: extra.address || point.address,
        schedule: extra.schedule || point.schedule,
        city: extra.city || point.city,
        lat: extra.lat || point.lat,
        lon: extra.lon || point.lon,
      }
    })
  } catch {
    return points
  }
}

async function loadSellerPoints(
  creds: OzonCreds,
  bounds: OzonBounds,
  center: { lat: number; lon: number },
  zoom: number
) {
  try {
    const raw = await sellerPost(creds, "/v1/delivery/map", {
      zoom: Math.round(Math.min(19, Math.max(0, zoom))),
      viewport: {
        left_bottom: {
          latitude: bounds.south,
          longitude: bounds.west,
        },
        right_top: {
          latitude: bounds.north,
          longitude: bounds.east,
        },
      },
    })
    const mapped = pointsInBounds(parseOzonPoints(raw), bounds)
    if (mapped.length) return enrichSellerPoints(creds, mapped)
  } catch {
    // Fall through to the full list, then clip to the viewport.
  }
  const raw = await sellerPost(creds, "/v1/delivery/point/list", {
    latitude: center.lat,
    longitude: center.lon,
  })
  return enrichSellerPoints(creds, pointsInBounds(parseOzonPoints(raw), bounds))
}

async function loadRocketPoints(creds: OzonCreds, bounds: OzonBounds) {
  const token = await rocketToken(creds)
  const raw = await rocketRequest(token, "GET", "/v1/delivery/variants")
  return pointsInBounds(parseOzonPoints(raw), bounds)
}

export async function loadOzonPoints(
  row: Record<string, unknown>,
  input: {
    city?: string
    query?: string
    lat?: number
    lon?: number
    south?: number
    west?: number
    north?: number
    east?: number
    zoom?: number
    phone?: string
  }
) {
  const creds = ozonCredsFromRow(row)
  const query = String(input.query || input.city || "").trim()
  let bounds = parseBounds(input)
  let center =
    Number.isFinite(input.lat) && Number.isFinite(input.lon)
      ? { lat: Number(input.lat), lon: Number(input.lon) }
      : null
  if (query && !center) {
    center = await geocodeCity(query)
    if (!center && !bounds) {
      return {
        configured: Boolean(creds),
        points: [] as OzonPoint[],
        center: null,
        message: "Не нашли это место.",
      }
    }
  }
  if (!bounds && center) {
    bounds = boundsFromCenter(center)
  }
  if (!center && bounds) {
    center = centerFromBounds(bounds)
  }
  if (!center) {
    center = { lat: 55.751244, lon: 37.618423 }
  }
  if (!bounds) {
    bounds = boundsFromCenter(center)
  }
  const zoom = Number(input.zoom)
  if (Number.isFinite(zoom) && zoom < 8) {
    return {
      configured: Boolean(creds),
      points: [] as OzonPoint[],
      center,
      message: creds
        ? "Приблизьте карту, чтобы показать пункты Ozon."
        : "Подключите Ozon Доставку в настройках магазина.",
    }
  }
  if (!creds) {
    return {
      configured: false,
      points: [] as OzonPoint[],
      center,
      message: "Подключите Ozon Доставку в настройках магазина.",
    }
  }
  try {
    const phone = normalizeOzonPhone(input.phone || "")
    if (phone && !isOzonRocketCreds(creds)) {
      try {
        await sellerPost(creds, "/v1/delivery/check", {
          client_phone: phone,
          phone,
        })
      } catch {
        // Availability check is best-effort until the cabinet is enabled.
      }
    }
    const points = isOzonRocketCreds(creds)
      ? await loadRocketPoints(creds, bounds)
      : await loadSellerPoints(creds, bounds, center, Number.isFinite(zoom) ? zoom : 12)
    return {
      configured: true,
      points,
      center,
      message: points.length
        ? null
        : "В этой области пунктов нет. Сдвиньте карту или найдите другой город.",
    }
  } catch (error) {
    return {
      configured: true,
      points: [] as OzonPoint[],
      center,
      message:
        error instanceof Error ? error.message : "Не удалось загрузить ПВЗ Ozon.",
    }
  }
}

function splitName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  return {
    first: parts[0] || "Покупатель",
    last: parts.slice(1).join(" ") || parts[0] || "Покупатель",
  }
}

async function createSellerOrder(input: {
  creds: OzonCreds
  buyer: { name: string; phone: string; email?: string }
  point: { id: string; address: string }
  items: Array<{ article: string; name: string; quantity: number; price: number }>
}) {
  const names = splitName(input.buyer.name)
  const phone = normalizeOzonPhone(input.buyer.phone)
  const mapPointId = Number(input.point.id) || input.point.id
  const checkout = (await sellerPost(input.creds, "/v2/delivery/checkout", {
    buyer_phone: phone,
    delivery_schema: "FBS",
    delivery_type: {
      pick_up: { map_point_id: mapPointId },
    },
    items: input.items.map((item) => ({
      offer_id: item.article,
      quantity: item.quantity,
    })),
  })) as Record<string, unknown>
  const splits = Array.isArray(checkout.splits) ? checkout.splits : []
  const schema =
    firstText(
      asRecord(splits[0])?.delivery_schema,
      checkout.delivery_schema
    ) || "FBS"
  return sellerPost(input.creds, "/v2/order/create", {
    buyer: {
      first_name: names.first,
      last_name: names.last,
      phone,
    },
    recipient: {
      recipient_first_name: names.first,
      recipient_last_name: names.last,
      phone,
    },
    delivery: {
      pick_up: { map_point_id: mapPointId },
    },
    delivery_schema: schema,
    splits,
  })
}

async function createRocketOrder(input: {
  creds: OzonCreds
  orderNumber: string
  buyer: { name: string; phone: string; email?: string }
  point: { id: string; address: string }
  amount: number
  items: Array<{ article: string; name: string; quantity: number; price: number }>
}) {
  const token = await rocketToken(input.creds)
  const payload: Record<string, unknown> = {
    order_number: input.orderNumber,
    orderNumber: input.orderNumber,
    buyer: {
      name: input.buyer.name,
      phone: normalizeOzonPhone(input.buyer.phone),
      email: input.buyer.email,
      type: "NaturalPerson",
    },
    recipient: {
      name: input.buyer.name,
      phone: normalizeOzonPhone(input.buyer.phone),
      email: input.buyer.email,
      type: "NaturalPerson",
    },
    delivery_information: {
      delivery_variant_id: input.point.id,
      address: input.point.address,
    },
    deliveryInformation: {
      deliveryVariantId: input.point.id,
      address: input.point.address,
    },
    payment: {
      type: "FullPrepayment",
      prepaymentAmount: input.amount,
      recipientPaymentAmount: 0,
      deliveryPrice: 0,
    },
    order_lines: input.items.map((item, index) => ({
      line_number: index + 1,
      article_number: item.article,
      name: item.name,
      quantity: item.quantity,
      selling_price: item.price,
      estimated_price: item.price,
    })),
    orderLines: input.items.map((item, index) => ({
      lineNumber: index + 1,
      articleNumber: item.article,
      name: item.name,
      quantity: item.quantity,
      sellingPrice: item.price,
      estimatedPrice: item.price,
    })),
  }
  if (input.creds.fromPlaceId) {
    payload.firstMileTransfer = {
      type: "DropOff",
      fromPlaceId: input.creds.fromPlaceId,
    }
  }
  try {
    return await rocketRequest(token, "POST", "/v2/order/create", payload)
  } catch {
    return rocketRequest(token, "POST", "/v1/order", payload)
  }
}

export async function createOzonDeliveryOrder(input: {
  creds: OzonCreds
  orderNumber: string
  buyer: { name: string; phone: string; email?: string }
  point: { id: string; address: string }
  amount: number
  items: Array<{ article: string; name: string; quantity: number; price: number }>
}) {
  if (isOzonRocketCreds(input.creds)) {
    return createRocketOrder(input)
  }
  try {
    return await createSellerOrder(input)
  } catch {
    return sellerPost(input.creds, "/v2/order/create", {
      order_number: input.orderNumber,
      buyer: {
        name: input.buyer.name,
        phone: normalizeOzonPhone(input.buyer.phone),
        email: input.buyer.email,
        type: "NaturalPerson",
      },
      delivery: {
        pick_up: { map_point_id: Number(input.point.id) || input.point.id },
      },
      delivery_information: {
        delivery_variant_id: input.point.id,
        address: input.point.address,
      },
      payment: {
        type: "FullPrepayment",
        prepaymentAmount: input.amount,
        recipientPaymentAmount: 0,
        deliveryPrice: 0,
      },
      order_lines: input.items.map((item, index) => ({
        line_number: index + 1,
        article_number: item.article,
        name: item.name,
        quantity: item.quantity,
        selling_price: item.price,
        estimated_price: item.price,
      })),
    })
  }
}
