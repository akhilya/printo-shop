import { parseShopIssueDetail, parseShopIssueReply } from "../shop-issue"
import { parseShopOrderRefund } from "../shop-order"

describe("parseShopIssueDetail", () => {
  it("reads JSON detail and treats missing status as open", () => {
    expect(
      parseShopIssueDetail({
        message: "кратко",
        detail: JSON.stringify({
          email: "A@test.ru",
          body: "Приехала не та фигурка",
          medusa_order_id: "order_1",
          source: "order",
          replies: [{ at: "2026-09-18", text: "вернём" }],
        }),
      })
    ).toMatchObject({
      email: "a@test.ru",
      body: "Приехала не та фигурка",
      status: "open",
      medusa_order_id: "order_1",
      source: "order",
    })
  })

  it("closes when the log level is info", () => {
    expect(
      parseShopIssueDetail({
        level: "info",
        message: "письмо",
        detail: "{}",
      }).status
    ).toBe("closed")
  })
})

describe("parseShopIssueReply", () => {
  it("needs a real reply", () => {
    expect(parseShopIssueReply({})).toEqual({
      error: "Напишите ответ покупателю",
    })
    expect(parseShopIssueReply({ message: "Вернули оплату, товар оставьте." })).toEqual({
      message: "Вернули оплату, товар оставьте.",
    })
  })
})

describe("parseShopOrderRefund", () => {
  it("keeps an optional note", () => {
    expect(parseShopOrderRefund({ note: "  брак  " })).toEqual({ note: "брак" })
    expect(parseShopOrderRefund({})).toEqual({ note: "" })
  })
})
