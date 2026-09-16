import {
  defaultTbankUrls,
  parseShopSettingUpdate,
  presentShopSetting,
  resolveTbankApiUrl,
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
    expect(options?.apiUrl).toBe("https://securepay.tinkoff.ru/v2")
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

describe("resolveTbankApiUrl", () => {
  it("rewrites rest-api-test to securepay", () => {
    expect(
      resolveTbankApiUrl("term", "https://rest-api-test.tinkoff.ru/v2")
    ).toBe("https://securepay.tinkoff.ru/v2")
  })

  it("keeps the live acquiring URL", () => {
    expect(resolveTbankApiUrl("term", "https://securepay.tinkoff.ru/v2")).toBe(
      "https://securepay.tinkoff.ru/v2"
    )
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

  it("marks ozon configured from the private app id and secret", () => {
    const publicView = presentShopSetting({
      ozon_client_id: "app-uuid",
      ozon_oauth_token: "app-secret",
    })
    expect(publicView.ozon_configured).toBe(false)
    expect(publicView.ozon_quote_mode).toBe("ozon")
    expect(
      presentShopSetting({
        ozon_quote_mode: "fixed",
        ozon_fixed_amount: 350,
      }).ozon_quote_mode
    ).toBe("fixed")
    expect(
      presentShopSetting({
        ozon_client_id: "app-uuid",
        ozon_oauth_token: "app-secret",
        ozon_refresh_token: "refresh-1",
      }).ozon_configured
    ).toBe(true)
    expect(publicView.ozon_from_place_id).toBe("")
    expect(publicView).not.toHaveProperty("ozon_oauth_token")
    expect(publicView).not.toHaveProperty("ozon_api_key")
    const sellerOnly = presentShopSetting({
      ozon_client_id: "12345",
      ozon_api_key: "seller-key",
    })
    expect(sellerOnly.ozon_configured).toBe(false)
    const admin = presentShopSetting(
      {
        ozon_client_id: "app-uuid",
        ozon_oauth_token: "app-secret",
        ozon_from_place_id: "wh",
      },
      { admin: true }
    )
    expect(admin.ozon_client_id).toBe("app-uuid")
    expect(admin.ozon_oauth_token_set).toBe(true)
    expect(admin.ozon_connected).toBe(false)
    const connected = presentShopSetting(
      {
        ozon_client_id: "app-uuid",
        ozon_oauth_token: "app-secret",
        ozon_refresh_token: "refresh-1",
      },
      { admin: true }
    )
    expect(connected.ozon_connected).toBe(true)
    expect(connected.ozon_quote_mode).toBe("ozon")
    expect(connected.ozon_fixed_amount).toBe(0)
    const priced = presentShopSetting(
      { ozon_quote_mode: "fixed", ozon_fixed_amount: 350 },
      { admin: true }
    )
    expect(priced.ozon_quote_mode).toBe("fixed")
    expect(priced.ozon_fixed_amount).toBe(350)
    expect(connected).not.toHaveProperty("ozon_refresh_token")
    expect(connected.ozon_oauth_redirect_uri).toMatch(/\/hooks\/ozon\/oauth$/)
    expect(admin).not.toHaveProperty("ozon_api_key_set")
    expect(admin).not.toHaveProperty("ozon_api_key")
    expect(admin).not.toHaveProperty("ozon_oauth_token")
  })
})

describe("parseShopSettingUpdate", () => {
  it("saves the private app client id and ignores seller api keys", () => {
    const update = parseShopSettingUpdate(
      {
        ozon_client_id: " app-uuid ",
        ozon_api_key: "seller-key",
        ozon_from_place_id: "wh-1",
      },
      { ozon_api_key: "old" }
    )
    expect(update.ozon_client_id).toBe("app-uuid")
    expect(update.ozon_api_key).toBeUndefined()
    expect(update.ozon_from_place_id).toBe("wh-1")
  })

  it("keeps the ozon oauth token when the field is empty", () => {
    const update = parseShopSettingUpdate(
      { ozon_oauth_token: "" },
      { ozon_oauth_token: "old" }
    )
    expect(update.ozon_oauth_token).toBeUndefined()
  })

  it("saves the private app secret", () => {
    const update = parseShopSettingUpdate(
      { ozon_client_id: "app-uuid", ozon_oauth_token: "app-secret" },
      {}
    )
    expect(update.ozon_client_id).toBe("app-uuid")
    expect(update.ozon_oauth_token).toBe("app-secret")
  })

  it("saves the ozon quote mode and fixed amount", () => {
    const update = parseShopSettingUpdate(
      { ozon_quote_mode: "fixed", ozon_fixed_amount: " 350 " },
      {}
    )
    expect(update.ozon_quote_mode).toBe("fixed")
    expect(update.ozon_fixed_amount).toBe(350)
    const ozon = parseShopSettingUpdate({ ozon_quote_mode: "ozon" }, {})
    expect(ozon.ozon_quote_mode).toBe("ozon")
  })

  it("keeps the current password when the field is empty", () => {
    const update = parseShopSettingUpdate(
      { closed: false, message: "Скоро", tbank_password: "" },
      { tbank_password: "old" }
    )
    expect(update.tbank_password).toBeUndefined()
    expect(update.message).toBe("Скоро")
  })

  it("rewrites rest-api-test to securepay on save", () => {
    const update = parseShopSettingUpdate(
      { tbank_api_url: "https://rest-api-test.tinkoff.ru/v2" },
      { tbank_terminal_key: "term" }
    )
    expect(update.tbank_api_url).toBe("https://securepay.tinkoff.ru/v2")
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
