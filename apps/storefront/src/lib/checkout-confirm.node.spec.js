import { describe, it } from "node:test"
import assert from "node:assert/strict"
import {
  checkoutConfirmFields,
  customOrderConfirmFields,
  personName,
  pvzLine,
} from "./checkout-confirm.js"

describe("checkoutConfirmFields", () => {
  it("lists contacts and the chosen PVZ", () => {
    assert.deepEqual(
      checkoutConfirmFields({
        first_name: "Анна",
        last_name: "Иванова",
        email: "anna@test.ru",
        phone: "+7 900 000-00-00",
        ozon_point_name: "ПВЗ на Ленина",
        ozon_point_address: "Ленина, 1",
      }),
      [
        { label: "Имя", value: "Анна Иванова" },
        { label: "Почта", value: "anna@test.ru" },
        { label: "Телефон", value: "+7 900 000-00-00" },
        { label: "Пункт выдачи", value: "ПВЗ на Ленина. Ленина, 1" },
      ]
    )
  })

  it("skips an empty pickup point", () => {
    assert.equal(personName("Анна", ""), "Анна")
    assert.equal(pvzLine("", ""), "")
    assert.deepEqual(
      checkoutConfirmFields({
        first_name: "Анна",
        email: "anna@test.ru",
        phone: "79000000000",
      }).map((field) => field.label),
      ["Имя", "Почта", "Телефон"]
    )
  })
})

describe("customOrderConfirmFields", () => {
  it("shows the request as filled", () => {
    assert.deepEqual(
      customOrderConfirmFields({
        product: "Сержант",
        name: "Анна",
        channelLabel: "Telegram",
        contact: "@anna",
        message: "Другая поза, 75 мм.",
      }),
      [
        { label: "Товар", value: "Сержант" },
        { label: "Имя", value: "Анна" },
        { label: "Telegram", value: "@anna" },
        { label: "Что сделать", value: "Другая поза, 75 мм." },
      ]
    )
  })
})
