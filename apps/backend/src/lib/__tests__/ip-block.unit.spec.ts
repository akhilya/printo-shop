import { clientIp, isBlockableIp } from "../client-ip"
import { parseBlockedIpInput } from "../ip-block"

describe("clientIp", () => {
  it("prefers x-real-ip from the reverse proxy", () => {
    expect(
      clientIp({
        headers: {
          "x-real-ip": "203.0.113.9",
          "x-forwarded-for": "8.8.8.8, 10.0.0.1",
        },
        ip: "127.0.0.1",
      })
    ).toBe("203.0.113.9")
  })

  it("uses the last forwarded hop so a client cannot spoof the first", () => {
    expect(
      clientIp({
        headers: { "x-forwarded-for": "8.8.8.8, 203.0.113.10" },
        ip: "127.0.0.1",
      })
    ).toBe("203.0.113.10")
  })

  it("strips ipv4-mapped ipv6", () => {
    expect(clientIp({ ip: "::ffff:192.168.1.5" })).toBe("192.168.1.5")
  })
})

describe("parseBlockedIpInput", () => {
  it("rejects empty and unknown", () => {
    expect(parseBlockedIpInput({})).toEqual({ error: "Укажите IP-адрес" })
    expect(parseBlockedIpInput({ ip: "unknown" })).toEqual({
      error: "Укажите IP-адрес",
    })
  })

  it("accepts an ipv4 address", () => {
    const parsed = parseBlockedIpInput({ ip: "8.8.8.8", reason: "spam" })
    expect(parsed).toEqual({ ip: "8.8.8.8", reason: "spam" })
    expect(isBlockableIp("8.8.8.8")).toBe(true)
  })
})
