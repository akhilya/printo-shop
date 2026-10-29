import {
  canManuallyRetryOzonOrderCreation,
  isOzonCreateRetryDue,
  ozonCreateRetryMetadata,
} from "../ozon-create-retry"

describe("Ozon create retry", () => {
  const now = Date.parse("2026-10-29T12:00:00.000Z")

  it("backs off failed attempts and caps the delay at one day", () => {
    expect(ozonCreateRetryMetadata({}, now)).toEqual({
      ozon_create_attempts: 1,
      ozon_create_retry_after: "2026-10-29T12:05:00.000Z",
    })
    expect(ozonCreateRetryMetadata({ ozon_create_attempts: 1 }, now)).toEqual({
      ozon_create_attempts: 2,
      ozon_create_retry_after: "2026-10-29T12:15:00.000Z",
    })
    expect(
      ozonCreateRetryMetadata({ ozon_create_attempts: 20 }, now)
        .ozon_create_retry_after
    ).toBe("2026-10-30T12:00:00.000Z")
  })

  it("retries failed orders only when due and not already created", () => {
    const failed = {
      ozon_create_error: "Нет интервала доставки",
      ozon_create_retry_after: "2026-10-29T12:05:00.000Z",
    }

    expect(
      isOzonCreateRetryDue({ ozon_create_error: "legacy failure" }, now)
    ).toBe(true)
    expect(isOzonCreateRetryDue(failed, now)).toBe(false)
    expect(
      isOzonCreateRetryDue(failed, now + 5 * 60 * 1000)
    ).toBe(true)
    expect(
      isOzonCreateRetryDue(
        { ...failed, ozon_posting_number: "post-1" },
        now + 1e9
      )
    ).toBe(false)
    expect(isOzonCreateRetryDue({}, now)).toBe(false)
  })

  it("allows manual retries only for failed orders without an Ozon id", () => {
    const failed = {
      ozon_create_error: "Нет интервала доставки",
      ozon_create_retry_after: "2026-10-29T13:00:00.000Z",
    }

    expect(canManuallyRetryOzonOrderCreation(failed)).toBe(true)
    expect(
      canManuallyRetryOzonOrderCreation({
        ...failed,
        ozon_order_number: "10001",
      })
    ).toBe(false)
    expect(
      canManuallyRetryOzonOrderCreation({
        ...failed,
        ozon_posting_number: "123-1",
      })
    ).toBe(false)
    expect(canManuallyRetryOzonOrderCreation({})).toBe(false)
  })
})
