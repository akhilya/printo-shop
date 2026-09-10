import {
  defaultTbankUrls,
  parseShopSettingUpdate,
  presentShopSetting,
  tbankOptionsFromRow,
} from "../shop-setting"

describe("tbankOptionsFromRow", () => {
  it("returns null without a terminal password", () => {
    expect(
      tbankOptionsFromRow({ tbank_terminal_key: "key" })
    ).toBeNull()
  })

  it("maps admin-saved tbank fields", () => {
    const options = tbankOptionsFromRow({
      tbank_terminal_key: "term",
      tbank_password: "secret",
      tbank_api_url: "https://rest-api-test.tinkoff.ru/v2",
      tbank_pay_type: "T",
      tbank_success_url: "https://shop.test/ok",
    })
    expect(options?.terminalKey).toBe("term")
    expect(options?.payType).toBe("T")
    expect(options?.successUrl).toBe("https://shop.test/ok")
    expect(options?.receipt).toBe(false)
    expect(options?.vat).toBe("none")
  })

  it("maps vat and taxation", () => {
    const options = tbankOptionsFromRow({
      tbank_terminal_key: "term",
      tbank_password: "secret",
      tbank_receipt: true,
      tbank_taxation: "osn",
      tbank_vat: "vat20",
    })
    expect(options?.receipt).toBe(true)
    expect(options?.taxation).toBe("osn")
    expect(options?.vat).toBe("vat20")
  })
})

describe("defaultTbankUrls", () => {
  it("builds shop and webhook urls from cors and backend url", () => {
    expect(
      defaultTbankUrls({
        STORE_CORS: "https://shop.example.com,http://localhost:8000",
        MEDUSA_BACKEND_URL: "https://api.example.com/",
      })
    ).toEqual({
      successUrl: "https://shop.example.com/checkout/success",
      failUrl: "https://shop.example.com/checkout/fail",
      notificationUrl: "https://api.example.com/hooks/tbank",
    })
  })
})

describe("presentShopSetting", () => {
  it("hides the password from the admin payload", () => {
    const presented = presentShopSetting(
      { tbank_password: "secret", tbank_terminal_key: "term", closed: true },
      { admin: true }
    )
    expect(presented).not.toHaveProperty("tbank_password")
    expect(presented.tbank_password_set).toBe(true)
    expect(presented.tbank_terminal_key).toBe("term")
    expect(presented.tbank_success_url).toMatch(/\/checkout\/success$/)
    expect(presented.tbank_fail_url).toMatch(/\/checkout\/fail$/)
    expect(presented.tbank_notification_url).toMatch(/\/hooks\/tbank$/)
  })
})

describe("parseShopSettingUpdate", () => {
  it("keeps the current password when the field is empty", () => {
    const update = parseShopSettingUpdate(
      { closed: false, message: "Скоро", tbank_password: "" },
      { tbank_password: "old" }
    )
    expect(update.tbank_password).toBeUndefined()
    expect(update.message).toBe("Скоро")
  })

  it("stores the orders lock separately from closed mode", () => {
    const update = parseShopSettingUpdate(
      {
        closed: false,
        orders_closed: true,
        orders_message: "Оплата на паузе",
      },
      {}
    )
    expect(update.closed).toBe(false)
    expect(update.orders_closed).toBe(true)
    expect(update.orders_message).toBe("Оплата на паузе")
  })
})
