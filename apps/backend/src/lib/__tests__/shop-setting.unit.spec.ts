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
    expect(options?.apiUrl).toBe("https://rest-api-test.tinkoff.ru/v2")
  })

  it("sends DEMO terminals to the production API", () => {
    const options = tbankOptionsFromRow({
      tbank_terminal_key: "PrintODEMO",
      tbank_password: "secret",
      tbank_api_url: "https://rest-api-test.tinkoff.ru/v2",
    })
    expect(options?.apiUrl).toBe("https://securepay.tinkoff.ru/v2")
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

  it("exposes ozon configured without the api key", () => {
    const publicView = presentShopSetting({
      ozon_client_id: "11",
      ozon_api_key: "secret",
    })
    expect(publicView.ozon_configured).toBe(true)
    expect(publicView).not.toHaveProperty("ozon_api_key")
    const admin = presentShopSetting(
      { ozon_client_id: "11", ozon_api_key: "secret", ozon_from_place_id: "wh" },
      { admin: true }
    )
    expect(admin.ozon_api_key_set).toBe(true)
    expect(admin.ozon_client_id).toBe("11")
    expect(admin).not.toHaveProperty("ozon_api_key")
  })
})

describe("parseShopSettingUpdate", () => {
  it("keeps ozon api key when the field is empty", () => {
    const update = parseShopSettingUpdate(
      { ozon_client_id: "11", ozon_api_key: "", ozon_from_place_id: "wh-1" },
      { ozon_api_key: "old" }
    )
    expect(update.ozon_client_id).toBe("11")
    expect(update.ozon_api_key).toBeUndefined()
    expect(update.ozon_from_place_id).toBe("wh-1")
  })

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
