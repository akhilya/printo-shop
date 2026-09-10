import { mapTbankStatus, toKopecks } from "../status"

describe("T-Bank status mapping", () => {
  it("maps confirmed and authorized to medusa actions", () => {
    expect(mapTbankStatus("CONFIRMED")).toBe("captured")
    expect(mapTbankStatus("AUTHORIZED")).toBe("authorized")
    expect(mapTbankStatus("REJECTED")).toBe("failed")
    expect(mapTbankStatus("CANCELED")).toBe("canceled")
    expect(mapTbankStatus("NEW")).toBe("pending")
  })

  it("converts major units to kopecks", () => {
    expect(toKopecks(1500)).toBe(150000)
    expect(toKopecks(10.5)).toBe(1050)
    expect(toKopecks({ numeric: 192 })).toBe(19200)
  })
})
