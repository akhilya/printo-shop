import { originAllowed } from "../store-cors"

describe("originAllowed", () => {
  it("allows an exact STORE_CORS origin", () => {
    expect(
      originAllowed("https://printo.studio", "https://printo.studio")
    ).toBe(true)
  })

  it("rejects a different origin", () => {
    expect(
      originAllowed("https://printo.studio", "https://api.printo.studio")
    ).toBe(false)
  })

  it("allows one of several origins", () => {
    expect(
      originAllowed(
        "https://printo.studio",
        "https://printo.studio,https://api.printo.studio"
      )
    ).toBe(true)
  })
})
