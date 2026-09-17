import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { isEmail, isPhone, isShopNumber } from "./form-valid.js"

describe("isEmail", () => {
  it("needs a real mailbox", () => {
    assert.equal(isEmail("anna@test.ru"), true)
    assert.equal(isEmail("anna@test"), false)
    assert.equal(isEmail(""), false)
  })
})

describe("isPhone", () => {
  it("accepts Russian 10–11 digit numbers", () => {
    assert.equal(isPhone("+7 (900) 000-00-00"), true)
    assert.equal(isPhone("89000000000"), true)
    assert.equal(isPhone("9000000000"), true)
    assert.equal(isPhone("123"), false)
  })
})

describe("isShopNumber", () => {
  it("is ten digits", () => {
    assert.equal(isShopNumber("4347820595"), true)
    assert.equal(isShopNumber("12"), false)
  })
})
