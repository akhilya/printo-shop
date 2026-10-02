import {
  analyticsHitAllowed,
  analyticsPathLabel,
  isAnalyticsBot,
  moscowDayKey,
  normalizeAnalyticsPath,
  parseAnalyticsHit,
  periodStart,
  resetAnalyticsRateLimit,
  summarizeShopAnalytics,
} from "../shop-analytics"

const VISITOR = "a".repeat(32)

describe("normalizeAnalyticsPath", () => {
  it("keeps a page and drops the query", () => {
    expect(normalizeAnalyticsPath("/products?page=2")).toBe("/products")
    expect(normalizeAnalyticsPath("/products/")).toBe("/products")
    expect(normalizeAnalyticsPath("/")).toBe("/")
  })

  it("hides order numbers and payment tokens", () => {
    expect(normalizeAnalyticsPath("/order/1042")).toBe("/order")
    expect(normalizeAnalyticsPath("/custom-order/pay/secret-token")).toBe(
      "/custom-order/pay"
    )
  })

  it("keeps product, collection and short links", () => {
    expect(normalizeAnalyticsPath("/p/knight")).toBe("/p/knight")
    expect(normalizeAnalyticsPath("/collections/col_1")).toBe(
      "/collections/col_1"
    )
    expect(normalizeAnalyticsPath("/vk")).toBe("/vk")
  })

  it("rejects paths that are not a site link", () => {
    expect(normalizeAnalyticsPath("https://evil.test")).toBeNull()
    expect(normalizeAnalyticsPath("/../secret")).toBeNull()
    expect(normalizeAnalyticsPath("/%2e%2e/secret")).toBeNull()
    expect(normalizeAnalyticsPath("/a b")).toBeNull()
  })
})

describe("parseAnalyticsHit", () => {
  it("accepts a page view", () => {
    expect(
      parseAnalyticsHit(
        { visitor: VISITOR, path: "/p/knight", kind: "view", source: "VK.com" },
        "Mozilla/5.0"
      )
    ).toEqual({
      visitor: VISITOR,
      path: "/p/knight",
      kind: "view",
      source: "vk.com",
    })
  })

  it("drops bots and broken visitors", () => {
    expect(isAnalyticsBot("TelegramBot (like TwitterBot)")).toBe(true)
    expect(
      parseAnalyticsHit(
        { visitor: VISITOR, path: "/", kind: "view" },
        "Googlebot"
      )
    ).toBeNull()
    expect(
      parseAnalyticsHit({ visitor: "nope", path: "/", kind: "view" }, "")
    ).toBeNull()
  })

  it("limits a repeat hit from the same visitor", () => {
    resetAnalyticsRateLimit()
    expect(analyticsHitAllowed(VISITOR, "view", "/", 1_000)).toBe(true)
    expect(analyticsHitAllowed(VISITOR, "view", "/", 1_200)).toBe(false)
    expect(analyticsHitAllowed(VISITOR, "view", "/products", 1_200)).toBe(true)
    expect(analyticsHitAllowed(VISITOR, "view", "/", 2_000)).toBe(true)
  })
})

describe("summarizeShopAnalytics", () => {
  const now = new Date("2026-10-02T10:00:00.000Z")

  it("counts orders, visitors, links and the moscow day", () => {
    expect(moscowDayKey(now)).toBe("2026-10-02")
    expect(periodStart("today", now).toISOString()).toBe(
      "2026-10-01T21:00:00.000Z"
    )
    const summary = summarizeShopAnalytics({
      now,
      period: "today",
      active: 2,
      views: [
        {
          path: "/vk",
          visitor: "a".repeat(32),
          kind: "view",
          source: "t.me",
          created_at: "2026-10-02T08:00:00.000Z",
        },
        {
          path: "/p/knight",
          visitor: "a".repeat(32),
          kind: "view",
          source: "",
          created_at: "2026-10-02T08:05:00.000Z",
        },
        {
          path: "/p/knight",
          visitor: "b".repeat(32),
          kind: "view",
          source: "",
          created_at: "2026-10-02T09:00:00.000Z",
        },
        {
          path: "/checkout",
          visitor: "b".repeat(32),
          kind: "view",
          created_at: "2026-10-02T09:10:00.000Z",
        },
        {
          path: "/p/knight",
          visitor: "b".repeat(32),
          kind: "cart",
          created_at: "2026-10-02T09:11:00.000Z",
        },
        {
          path: "/",
          visitor: "c".repeat(32),
          kind: "view",
          created_at: "2026-10-01T20:00:00.000Z",
        },
      ],
      orders: [
        {
          created_at: "2026-10-02T09:20:00.000Z",
          paid: true,
          canceled: false,
          custom: false,
          total: 1500,
        },
        {
          created_at: "2026-10-02T09:30:00.000Z",
          paid: false,
          canceled: true,
          custom: false,
          total: 900,
        },
        {
          created_at: "2026-10-02T09:40:00.000Z",
          paid: true,
          canceled: false,
          custom: true,
          total: 500,
        },
      ],
    })

    expect(summary.views).toBe(4)
    expect(summary.visitors).toBe(2)
    expect(summary.carts).toBe(1)
    expect(summary.checkouts).toBe(1)
    expect(summary.orders).toBe(1)
    expect(summary.custom_orders).toBe(1)
    expect(summary.paid).toBe(2)
    expect(summary.revenue).toBe(2000)
    expect(summary.average).toBe(1000)
    expect(summary.conversion).toBe(1)
    expect(summary.active).toBe(2)
    expect(analyticsPathLabel("/p/knight")).toBe("Товар knight")
    expect(summary.pages[0]).toMatchObject({
      path: "/p/knight",
      views: 2,
      visitors: 2,
    })
    expect(summary.pages.map((row) => row.path)).toContain("/vk")
    expect(summary.sources.map((row) => row.label)).toEqual(
      expect.arrayContaining(["t.me", "Прямой заход"])
    )
    const hour = summary.series.find((row) => row.key === "11")
    expect(hour?.views).toBeGreaterThan(0)
    expect(summary.series.find((row) => row.key === "0")?.views).toBe(0)
  })
})
