import { parseBannerInput } from "../banner"
import {
  MAX_CUSTOM_ORDER_IMAGES,
  customOrderCheckoutUrl,
  messengerHref,
  parseCustomOrderInput,
  parseCustomOrderQuote,
  presentPublicCustomCheckout,
} from "../custom-order"
import { checkSubmitLimit } from "../submit-limit"

describe("parseBannerInput", () => {
  it("requires slot, title and body", () => {
    expect(parseBannerInput({ slot: "home_hero" })).toEqual({
      error: "Нужны слот, заголовок и текст",
    })
  })

  it("accepts a home hero banner", () => {
    const parsed = parseBannerInput({
      slot: "home_hero",
      title: "Дешевле, чем на маркетплейсах",
      body: "Без комиссии витрин.",
      cta_label: "Каталог",
      cta_href: "/products",
    })
    expect("error" in parsed).toBe(false)
    if ("error" in parsed) return
    expect(parsed.slot).toBe("home_hero")
    expect(parsed.enabled).toBe(true)
  })
})

describe("parseCustomOrderInput", () => {
  it("requires a name, a message, and a contact", () => {
    expect(parseCustomOrderInput({ name: "Анна", message: "Хочу дракона" })).toEqual({
      error: "Укажите хотя бы один способ связи",
    })
  })

  it("accepts telegram as the only contact", () => {
    const parsed = parseCustomOrderInput({
      name: "Анна",
      telegram: "@anna",
      message: "Своя модель",
    })
    expect("error" in parsed).toBe(false)
    if ("error" in parsed) return
    expect(parsed.telegram).toBe("@anna")
    expect(parsed.email).toBeNull()
  })

  it("keeps an optional product id", () => {
    const parsed = parseCustomOrderInput({
      name: "Анна",
      email: "anna@test.com",
      message: "Хочу в другом масштабе",
      product_id: "prod_1",
    })
    expect("error" in parsed).toBe(false)
    if ("error" in parsed) return
    expect(parsed.product_id).toBe("prod_1")
    expect(parsed.email).toBe("anna@test.com")
  })

  it("accepts a free-form request with a phone and no product", () => {
    const parsed = parseCustomOrderInput({
      name: "Иван",
      phone: "+7 900 000-00-00",
      message: "Своя модель дракона, 75 мм",
    })
    expect("error" in parsed).toBe(false)
    if ("error" in parsed) return
    expect(parsed.product_id).toBeNull()
    expect(parsed.phone).toBe("+7 900 000-00-00")
  })

  it("rejects more photos than allowed before reading them", () => {
    const images = Array.from({ length: MAX_CUSTOM_ORDER_IMAGES + 1 }, () => ({
      content: "data:image/png;base64,x",
    }))
    expect(parseCustomOrderInput({
      name: "Анна",
      email: "a@test.com",
      message: "Модель",
      images,
    })).toEqual({
      error: `Можно прикрепить не больше ${MAX_CUSTOM_ORDER_IMAGES} фото`,
    })
  })

  it("builds messenger links", () => {
    expect(messengerHref("@anna", "telegram")).toBe("https://t.me/anna")
    expect(messengerHref("id1", "vk")).toBe("https://vk.com/id1")
  })
})

describe("parseCustomOrderQuote", () => {
  it("requires a price", () => {
    expect(parseCustomOrderQuote({})).toEqual({ error: "Укажите цену в рублях" })
  })

  it("keeps PVZ self-pick only for Ozon delivery", () => {
    const parsed = parseCustomOrderQuote({
      quote_amount: 4500,
      quote_note: "75 мм, грунт",
      delivery_method: "ozon",
      client_picks_pvz: true,
    })
    expect(parsed).toMatchObject({
      quote_amount: 4500,
      delivery_method: "ozon",
      client_picks_pvz: true,
    })
    expect(
      parseCustomOrderQuote({
        quote_amount: 4500,
        client_picks_pvz: true,
      })
    ).toMatchObject({ delivery_method: null, client_picks_pvz: false })
  })
})

describe("presentPublicCustomCheckout", () => {
  it("hides admin fields and builds the pay url helper", () => {
    expect(customOrderCheckoutUrl("tok_1", { STORE_CORS: "https://printo.studio" })).toBe(
      "https://printo.studio/custom-order/pay/tok_1"
    )
    const publicView = presentPublicCustomCheckout({
      id: "ord_1",
      name: "Анна",
      email: "a@test.com",
      message: "Скрытый черновик",
      quote_note: "75 мм",
      quote_amount: 4500,
      delivery_method: "ozon",
      client_picks_pvz: true,
      checkout_token: "tok_1",
      ip: "10.0.0.1",
      status: "quoted",
    })
    expect(publicView.note).toBe("75 мм")
    expect(publicView.quote_note).toBe("75 мм")
    expect(publicView.message).toBe("Скрытый черновик")
    expect(publicView.amount).toBe(4500)
    expect(publicView.client_picks_pvz).toBe(true)
    expect(publicView.paid).toBe(false)
    expect(publicView).not.toHaveProperty("ip")
  })
})

describe("checkSubmitLimit", () => {
  it("allows a few submits then blocks", () => {
    const key = `test-${Date.now()}`
    expect(checkSubmitLimit(key)).toEqual({ ok: true })
    expect(checkSubmitLimit(key)).toEqual({ ok: true })
    expect(checkSubmitLimit(key)).toEqual({ ok: true })
    expect(checkSubmitLimit(key)).toEqual({
      error: "Слишком много заявок. Подождите несколько минут.",
    })
  })
})
