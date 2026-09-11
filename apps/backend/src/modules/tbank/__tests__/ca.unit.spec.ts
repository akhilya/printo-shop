import { tbankCaPem } from "../ca"

describe("tbankCaPem", () => {
  it("loads the MinTsifry bundle from the repo", () => {
    const pem = tbankCaPem()
    expect(pem).toContain("BEGIN CERTIFICATE")
    expect(pem.split("BEGIN CERTIFICATE").length).toBeGreaterThan(2)
  })
})
