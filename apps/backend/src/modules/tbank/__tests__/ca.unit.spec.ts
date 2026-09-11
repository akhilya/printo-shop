import { tbankCaPem, tbankPublicError } from "../ca"

describe("tbankCaPem", () => {
  it("loads the MinTsifry bundle from the repo", () => {
    const pem = tbankCaPem()
    expect(pem).toContain("BEGIN CERTIFICATE")
    expect(pem.split("BEGIN CERTIFICATE").length).toBeGreaterThan(2)
  })
})

describe("tbankPublicError", () => {
  it("explains nginx 403 from rest-api-test", () => {
    const text = tbankPublicError(
      new Error(
        "T-Bank rest-api-test.tinkoff.ru/v2/Init HTTP 403: <html> <head><title>403 Forbidden</title></head>"
      )
    )
    expect(text).toMatch(/403/)
    expect(text).toMatch(/securepay\.tinkoff\.ru/)
    expect(text).not.toMatch(/<html>/)
  })
})
