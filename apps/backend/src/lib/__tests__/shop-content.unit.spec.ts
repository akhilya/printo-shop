import { parseBannerInput } from "../banner"
import {
  MAX_CUSTOM_ORDER_IMAGES,
  messengerHref,
  parseCustomOrderInput,
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
