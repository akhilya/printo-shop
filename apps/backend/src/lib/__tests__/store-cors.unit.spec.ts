import { originAllowed, applyStoreCors } from "../store-cors"

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

  it("allows the www host when only the apex is listed", () => {
    expect(
      originAllowed("https://www.printo.studio", "https://printo.studio")
    ).toBe(true)
  })

  it("allows the apex when only the www host is listed", () => {
    expect(
      originAllowed("https://printo.studio", "https://www.printo.studio")
    ).toBe(true)
  })

  it("does not invent a www alias for localhost", () => {
    expect(
      originAllowed("http://www.localhost:8000", "http://localhost:8000")
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

describe("applyStoreCors", () => {
  const prev = process.env.STORE_CORS

  afterEach(() => {
    process.env.STORE_CORS = prev
  })

  function run(method: string, origin: string) {
    const headers: Record<string, string> = {}
    const req = { method, headers: { origin } } as never
    let status = 0
    let ended = false
    let nexted = false
    const res = {
      setHeader(key: string, value: string) {
        headers[key] = value
      },
      status(code: number) {
        status = code
        return this
      },
      end() {
        ended = true
      },
    } as never
    applyStoreCors(req, res, () => {
      nexted = true
    })
    return { headers, status, ended, nexted }
  }

  it("answers OPTIONS without hitting the route", () => {
    process.env.STORE_CORS = "https://printo.studio"
    const result = run("OPTIONS", "https://printo.studio")
    expect(result.status).toBe(204)
    expect(result.ended).toBe(true)
    expect(result.nexted).toBe(false)
    expect(result.headers["Access-Control-Max-Age"]).toBe("86400")
    expect(result.headers["Access-Control-Allow-Origin"]).toBe(
      "https://printo.studio"
    )
  })

  it("lets GET continue", () => {
    process.env.STORE_CORS = "https://printo.studio"
    const result = run("GET", "https://printo.studio")
    expect(result.ended).toBe(false)
    expect(result.nexted).toBe(true)
  })
})
