import { signTbankPayload, verifyTbankToken } from "../token"

describe("T-Bank request token", () => {
  const password = "11111111111111"

  it("matches the official Init example", () => {
    const token = signTbankPayload(
      {
        TerminalKey: "MerchantTerminalKey",
        Amount: 19200,
        OrderId: "00000",
        Description: "Подарочная карта на 1000 рублей",
        DATA: { Phone: "+71234567890" },
        Receipt: { Email: "a@test.ru" },
      },
      password
    )

    expect(token).toBe(
      "72dd466f8ace0a37a1f740ce5fb78101712bc0665d91a8108c7c8a0ccd426db2"
    )
  })

  it("ignores Token and nested objects when verifying a notification", () => {
    const payload = {
      TerminalKey: "MerchantTerminalKey",
      OrderId: "00000",
      Success: true,
      Status: "CONFIRMED",
      PaymentId: 123,
      ErrorCode: "0",
      Amount: 19200,
      Token: "placeholder",
    }
    const token = signTbankPayload(payload, password)
    expect(verifyTbankToken({ ...payload, Token: token }, password)).toBe(true)
    expect(verifyTbankToken({ ...payload, Token: "deadbeef" }, password)).toBe(
      false
    )
  })
})
