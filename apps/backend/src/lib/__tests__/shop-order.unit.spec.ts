import { errorText } from "../shop-order"

describe("errorText", () => {
  it("reads Error messages", () => {
    expect(errorText(new Error("order_not_found"))).toBe("order_not_found")
  })

  it("reads serialized workflow errors that are not Error instances", () => {
    expect(errorText({ message: "Missing T-Bank PaymentId" })).toBe(
      "Missing T-Bank PaymentId"
    )
    expect(
      errorText({
        errors: [{ error: { message: "Неверный статус транзакции" } }],
      })
    ).toBe("Неверный статус транзакции")
  })

  it("falls back when nothing useful is present", () => {
    expect(errorText(null)).toBe("cancel_failed")
    expect(errorText({})).toBe("cancel_failed")
  })
})
