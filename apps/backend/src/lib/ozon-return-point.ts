import { asRecord, sellerPost, type OzonCreds } from "./ozon-delivery"

function numberOf(...values: unknown[]) {
  for (const value of values) {
    if (value == null || value === "" || typeof value === "object") continue
    const numeric = Number(value)
    if (Number.isFinite(numeric) && numeric > 0) return numeric
  }
  return null
}

function rowsOf(raw: unknown, key: string) {
  const rec = asRecord(raw)
  const nested = asRecord(rec?.result)
  const list = rec?.[key] ?? nested?.[key]
  return Array.isArray(list) ? list : []
}

function mileOf(warehouse: Record<string, unknown>) {
  return asRecord(warehouse.first_mile) || asRecord(warehouse.first_mile_type)
}

function mileType(warehouse: Record<string, unknown>) {
  const mile = mileOf(warehouse)
  const raw = mile?.type ?? mile?.first_mile_type ?? warehouse.first_mile_type
  return typeof raw === "string" ? raw.trim().toLowerCase() : ""
}

function returnPointId(raw: unknown) {
  const point = asRecord(raw)
  return numberOf(point?.id, point?.return_point_id, raw)
}

export function ozonReturnPointBody(
  warehouse: unknown,
  currentReturnPointId: number | null
) {
  const row = asRecord(warehouse)
  if (!row || row.is_rfbs === true) return null
  const status = String(row.status || "").trim().toLowerCase()
  if (/disabled|blocked|error|archived/.test(status)) return null
  if (!/drop_?off/.test(mileType(row))) return null
  const mile = mileOf(row)
  if (mile?.first_mile_is_changing === true) return null
  const warehouseId = numberOf(row.warehouse_id, row.warehouseId)
  const dropOffId = numberOf(
    mile?.dropoff_point_id,
    mile?.drop_off_point_id,
    mile?.dropoffPointId
  )
  const timeslotId = numberOf(
    mile?.timeslot_id,
    mile?.dropoff_timeslot_id,
    mile?.timeslotId
  )
  if (warehouseId == null || dropOffId == null || timeslotId == null) return null
  if (currentReturnPointId != null && currentReturnPointId === dropOffId) return null
  const cutIn = numberOf(row.cut_in_time, row.cutInTime)
  return {
    warehouse_id: warehouseId,
    first_mile_type: "DROP_OFF",
    drop_off_point_id: dropOffId,
    timeslot_id: timeslotId,
    cut_in_time: cutIn ?? 0,
    return_point_id: dropOffId,
  }
}

export function planOzonReturnPointUpdates(warehouses: unknown, returnMile: unknown) {
  const current = new Map<number, number | null>()
  for (const row of rowsOf(returnMile, "return_mile_settings")) {
    const setting = asRecord(row)
    if (!setting) continue
    const warehouseId = numberOf(setting.warehouse_id, setting.warehouseId)
    if (warehouseId == null) continue
    current.set(warehouseId, returnPointId(setting.return_point))
  }
  return rowsOf(warehouses, "warehouses")
    .map((warehouse) => {
      const id = numberOf(asRecord(warehouse)?.warehouse_id)
      return ozonReturnPointBody(warehouse, id == null ? null : current.get(id) ?? null)
    })
    .filter((body): body is NonNullable<typeof body> => Boolean(body))
}

async function listOzonWarehouses(creds: OzonCreds) {
  const rows: unknown[] = []
  let cursor = ""
  for (let page = 0; page < 10; page++) {
    const raw = await sellerPost(creds, "/v2/warehouse/list", {
      limit: 200,
      ...(cursor ? { cursor } : {}),
    })
    const rec = asRecord(raw)
    rows.push(...rowsOf(raw, "warehouses"))
    const next = String(rec?.cursor || "").trim()
    if (!rec?.has_next || !next || next === cursor) break
    cursor = next
  }
  return rows
}

export async function alignOzonReturnPoints(creds: OzonCreds) {
  const warehouses = await listOzonWarehouses(creds)
  const ids = warehouses
    .map((warehouse) => numberOf(asRecord(warehouse)?.warehouse_id))
    .filter((id): id is number => id != null)
  if (!ids.length) return { updated: 0 }
  const returnMile = await sellerPost(creds, "/v1/warehouse/fbs/return-mile/info", {
    warehouse_ids: ids,
  })
  const updates = planOzonReturnPointUpdates({ warehouses }, returnMile)
  for (const body of updates) {
    await sellerPost(creds, "/v1/warehouse/fbs/first-mile/update", body)
  }
  return { updated: updates.length }
}
