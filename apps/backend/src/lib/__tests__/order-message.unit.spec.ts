import { emailsMatch, parseOrderMessageInput } from "../order-message"
import { smtpFromAddress } from "../smtp"

describe("parseOrderMessageInput", () => {
  it("needs a matching-style email and a real message", () => {
    expect(parseOrderMessageInput({})).toEqual({
      error: "Укажите почту, с которой оформляли заказ",
    })
    expect(
      parseOrderMessageInput({ email: "a@test.ru", message: "брак" })
    ).toEqual({
      error: "Напишите, что случилось. Хотя бы пару предложений.",
    })
    expect(
      parseOrderMessageInput({
        email: "A@Test.ru",
        message: "Приехала не та фигурка, на фото другая.",
      })
    ).toEqual({
      email: "a@test.ru",
      message: "Приехала не та фигурка, на фото другая.",
    })
  })
})

describe("emailsMatch", () => {
  it("ignores case", () => {
    expect(emailsMatch("A@test.ru", "a@test.ru")).toBe(true)
    expect(emailsMatch("b@test.ru", "a@test.ru")).toBe(false)
  })
})

describe("smtpFromAddress", () => {
  it("reads an angled address", () => {
    expect(smtpFromAddress("PrintO.studio <mail@printo.studio>")).toBe(
      "mail@printo.studio"
    )
    expect(smtpFromAddress("mail@printo.studio")).toBe("mail@printo.studio")
  })
})
