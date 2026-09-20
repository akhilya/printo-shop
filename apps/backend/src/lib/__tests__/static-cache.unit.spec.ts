import { applyStaticCache, STATIC_CACHE_CONTROL } from "../static-cache"

describe("applyStaticCache", () => {
  function run() {
    const headers: Record<string, string> = {}
    const res = {
      setHeader(key: string, value: string) {
        headers[key] = value
        return this
      },
    }
    let nexted = false
    applyStaticCache({} as never, res as never, () => {
      nexted = true
    })
    return { headers, res, nexted }
  }

  it("sets a long immutable cache before the file is sent", () => {
    const { headers, nexted } = run()
    expect(nexted).toBe(true)
    expect(headers["Cache-Control"]).toBe(STATIC_CACHE_CONTROL)
  })

  it("keeps the long cache if serve-static overwrites Cache-Control", () => {
    const { headers, res } = run()
    res.setHeader("Cache-Control", "public, max-age=0")
    expect(headers["Cache-Control"]).toBe(STATIC_CACHE_CONTROL)
  })
})
