import {
  mailAlreadySent,
  mailEventFromShopStatus,
  orderMailCopy,
  withMailSent,
} from "../order-mail-copy"
import { orderMailPayloadFromMedusa as payloadFromOrder } from "../order-mail"
import { buildOrderMail, escapeHtml, formatShopMoney } from "../order-mail-html"
import { parseSmtpEnv } from "../smtp"

describe("parseSmtpEnv", () => {
  it("needs host, user, password and from", () => {
    expect(parseSmtpEnv({})).toBeNull()
    expect(
      parseSmtpEnv({
        SMTP_HOST: "postbox.cloud.yandex.net",
        SMTP_USER: "key",
        SMTP_PASSWORD: "secret",
        SMTP_FROM: "shop@printo.studio",
      })
    ).toMatchObject({
      host: "postbox.cloud.yandex.net",
      port: 587,
      requireTls: true,
      secure: false,
    })
  })

  it("uses SMTPS on 465", () => {
    expect(
      parseSmtpEnv({
        SMTP_HOST: "postbox.cloud.yandex.net",
        SMTP_PORT: "465",
        SMTP_STARTTLS: "false",
        SMTP_USER: "key",
        SMTP_PASSWORD: "secret",
        SMTP_FROM: "shop@printo.studio",
      })
    ).toMatchObject({ port: 465, secure: true, requireTls: false })
  })
})

describe("orderMailCopy", () => {
  it("writes Russian subjects", () => {
    expect(orderMailCopy("placed", "1234567890").subject).toBe(
      "Заказ 1234567890 принят"
    )
    expect(orderMailCopy("delivering", "1234567890").intro).toMatch(/14 дней/)
    expect(orderMailCopy("delivered", "1234567890").intro).toMatch(
      /одной кнопкой нельзя/
    )
    expect(orderMailCopy("returned", "1234567890", "unclaimed").intro).toMatch(
      /не забрали/
    )
    expect(orderMailCopy("returned", "1234567890", "unclaimed").intro).toMatch(
      /оплату не возвращает/
    )
    expect(orderMailCopy("returned", "1234567890", "unclaimed").intro).not.toMatch(
      /вернём оплату/
    )
    expect(orderMailCopy("returned", "1234567890", "refused").subject).toMatch(
      /отказ/i
    )
  })
})

describe("mailEventFromShopStatus", () => {
  it("maps shop statuses to mail events", () => {
    expect(mailEventFromShopStatus("awaiting_deliver")).toBe("packed")
    expect(mailEventFromShopStatus("delivering")).toBe("delivering")
    expect(mailEventFromShopStatus("delivered")).toBe("delivered")
    expect(mailEventFromShopStatus("returned")).toBe("returned")
    expect(mailEventFromShopStatus("awaiting_pack")).toBeNull()
  })
})

describe("mailAlreadySent", () => {
  it("records events on metadata", () => {
    const next = withMailSent({}, "placed")
    expect(mailAlreadySent(next, "placed")).toBe(true)
    expect(mailAlreadySent(next, "packed")).toBe(false)
  })
})

describe("buildOrderMail", () => {
  it("includes items, PVZ and the order link", () => {
    const mail = buildOrderMail({
      event: "placed",
      number: "1234567890",
      url: "https://printo.studio/order/1234567890",
      email: "a@test.ru",
      name: "Иван Петров",
      phone: "+7999",
      status_label: "В сборке",
      items: [
        { title: "Temple Assassins", quantity: 2, sku: "WA150", unit_price: 750 },
      ],
      shipping: 350,
      total: 1850,
      currency_code: "rub",
      ozon_point_name: "ПВЗ Тверская",
      ozon_point_address: "Тверская 1",
      ozon_tracking: "https://www.ozon.ru/my/orderdetails/?order=1",
      ozon_posting_number: "1-1",
      returns_url: "https://printo.studio/returns",
    })
    expect(mail.to).toBe("a@test.ru")
    expect(mail.subject).toBe("Заказ 1234567890 принят")
    expect(mail.text).toMatch(/Temple Assassins · WA150/)
    expect(mail.text).toMatch(/ПВЗ Тверская/)
    expect(mail.text).toMatch(/printo.studio\/order\/1234567890/)
    expect(mail.html).toMatch(/Открыть заказ/)
    expect(mail.text).toMatch(/printo.studio\/returns/)
    expect(mail.html).toContain("Temple Assassins")
    expect(escapeHtml("<b>")).toBe("&lt;b&gt;")
    expect(formatShopMoney(1850, "rub")).toMatch(/1.?850/)
  })
})

describe("orderMailPayloadFromMedusa", () => {
  it("skips orders without email", () => {
    expect(
      payloadFromOrder({ status: "completed", items: [] }, "placed", "1234567890")
    ).toBeNull()
  })

  it("reads PVZ and totals", () => {
    const payload = payloadFromOrder(
      {
        email: "Buyer@Test.ru",
        status: "completed",
        total: 1850,
        currency_code: "rub",
        metadata: {
          ozon_point_name: "ПВЗ Тверская",
          ozon_point_address: "Тверская 1",
          ozon_shipping_amount: 350,
        },
        shipping_address: { first_name: "Иван", last_name: "Петров", phone: "7999" },
        items: [
          {
            title: "Фигурка",
            quantity: 2,
            unit_price: 750,
            variant: { sku: "WA150", product: { title: "Temple Assassins" } },
          },
        ],
      },
      "placed",
      "1234567890"
    )
    expect(payload?.email).toBe("buyer@test.ru")
    expect(payload?.items[0].title).toBe("Temple Assassins")
    expect(payload?.shipping).toBe(350)
    expect(payload?.ozon_point_name).toBe("ПВЗ Тверская")
  })
})
