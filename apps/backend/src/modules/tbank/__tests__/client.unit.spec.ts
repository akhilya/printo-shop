import { TbankClient, isPublicHttpUrl } from "../client"

describe("isPublicHttpUrl", () => {
  it("rejects localhost callback urls", () => {
    expect(isPublicHttpUrl("http://localhost:8000/checkout/success")).toBe(
      false
    )
    expect(isPublicHttpUrl("http://127.0.0.1:9000/hooks/tbank")).toBe(false)
  })

  it("allows public https urls", () => {
    expect(isPublicHttpUrl("https://printo.studio/checkout/success")).toBe(true)
  })
})

describe("TbankClient.init", () => {
  it("omits localhost callback urls from Init", async () => {
    let sent: Record<string, unknown> = {}
    const client = new TbankClient({
      terminalKey: "DemoKey",
      password: "secret",
      apiUrl: "https://securepay.tinkoff.ru/v2",
      fetchImpl: (async (_url, init) => {
        sent = JSON.parse(String(init?.body || "{}"))
        return {
          ok: true,
          json: async () => ({
            Success: true,
            ErrorCode: "0",
            PaymentId: 1,
            PaymentURL: "https://pay.test",
          }),
        } as Response
      }) as typeof fetch,
    })
    await client.init({
      orderId: "ord1",
      amountKopecks: 15000,
      successUrl: "http://localhost:8000/checkout/success",
      failUrl: "http://localhost:8000/checkout/fail",
      notificationUrl: "http://localhost:9000/hooks/tbank",
    })
    expect(sent.SuccessURL).toBeUndefined()
    expect(sent.FailURL).toBeUndefined()
    expect(sent.NotificationURL).toBeUndefined()
    expect(sent.Amount).toBe(15000)
  })
})
