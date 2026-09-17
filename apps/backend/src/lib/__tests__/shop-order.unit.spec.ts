import {
  errorText,
  parseShopOrderCancel,
} from "../shop-order"
import { cancelMailDetails } from "../order-mail-copy"

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
    expect(errorText(null, "status_failed")).toBe("status_failed")
  })
})

describe("parseShopOrderCancel", () => {
  it("keeps a buyer-facing reason and extra text", () => {
    expect(
      parseShopOrderCancel({
        reason: "out_of_stock",
        note: "Осталась одна деталь",
      })
    ).toMatchObject({
      reason: "out_of_stock",
      reason_label: "Товара нет в наличии",
      note: "Осталась одна деталь",
      refund: true,
    })
  })

  it("asks for text when the reason is other", () => {
    expect(parseShopOrderCancel({ reason: "other" })).toEqual({
      error: "Напишите причину отмены",
    })
  })
})

describe("cancelMailDetails", () => {
  it("puts the reason into the letter", () => {
    expect(
      cancelMailDetails({
        reason_label: "Товара нет в наличии",
        note: "Ждём поставку",
      })
    ).toMatch(/Товара нет в наличии/)
  })
})
