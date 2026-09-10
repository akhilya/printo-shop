import { publicBackendUrl } from "../public-url"

describe("publicBackendUrl", () => {
  it("prefers the forwarded admin host over MEDUSA_BACKEND_URL", () => {
    expect(
      publicBackendUrl(
        {
          headers: {
            "x-forwarded-host": "api.printo.studio",
            "x-forwarded-proto": "https",
          },
        },
        { MEDUSA_BACKEND_URL: "https://api.printo.store" }
      )
    ).toBe("https://api.printo.studio")
  })

  it("ignores localhost and falls back to API_HOST", () => {
    expect(
      publicBackendUrl(
        { headers: { host: "localhost:9000" }, protocol: "http" },
        {
          API_HOST: "api.printo.studio",
          MEDUSA_BACKEND_URL: "https://api.printo.store",
        }
      )
    ).toBe("https://api.printo.studio")
  })

  it("uses MEDUSA_BACKEND_URL when no public host is known", () => {
    expect(
      publicBackendUrl(undefined, {
        MEDUSA_BACKEND_URL: "https://api.example.com/",
      })
    ).toBe("https://api.example.com")
  })
})
