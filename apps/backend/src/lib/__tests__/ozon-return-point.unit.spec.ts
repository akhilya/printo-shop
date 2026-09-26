import {
  ozonReturnPointBody,
  planOzonReturnPointUpdates,
} from "../ozon-return-point"

const warehouse = {
  warehouse_id: 10,
  status: "created",
  is_rfbs: false,
  cut_in_time: 60,
  first_mile: {
    type: "DROP_OFF",
    dropoff_point_id: "900",
    timeslot_id: 7,
    first_mile_is_changing: false,
  },
}

describe("ozonReturnPointBody", () => {
  it("sends unclaimed returns to the drop-off point", () => {
    expect(ozonReturnPointBody(warehouse, null)).toEqual({
      warehouse_id: 10,
      first_mile_type: "DROP_OFF",
      drop_off_point_id: 900,
      timeslot_id: 7,
      cut_in_time: 60,
      return_point_id: 900,
    })
  })

  it("leaves a return point that is already the drop-off", () => {
    expect(ozonReturnPointBody(warehouse, 900)).toBeNull()
  })

  it("replaces a return point that is not the drop-off", () => {
    expect(ozonReturnPointBody(warehouse, 555)?.return_point_id).toBe(900)
  })

  it("skips pickup, rfbs, and a mile that is already changing", () => {
    expect(
      ozonReturnPointBody(
        { ...warehouse, first_mile: { ...warehouse.first_mile, type: "PICK_UP" } },
        null
      )
    ).toBeNull()
    expect(ozonReturnPointBody({ ...warehouse, is_rfbs: true }, null)).toBeNull()
    expect(
      ozonReturnPointBody(
        {
          ...warehouse,
          first_mile: { ...warehouse.first_mile, first_mile_is_changing: true },
        },
        null
      )
    ).toBeNull()
  })
})

describe("planOzonReturnPointUpdates", () => {
  it("updates only warehouses whose return point differs", () => {
    const bodies = planOzonReturnPointUpdates(
      {
        warehouses: [
          warehouse,
          { ...warehouse, warehouse_id: 11, first_mile: { ...warehouse.first_mile, dropoff_point_id: 42 } },
        ],
      },
      {
        return_mile_settings: [
          { warehouse_id: 10, return_point: { id: 900 } },
          { warehouse_id: 11, return_point: { id: 1 } },
        ],
      }
    )
    expect(bodies).toEqual([
      expect.objectContaining({ warehouse_id: 11, return_point_id: 42 }),
    ])
  })
})
