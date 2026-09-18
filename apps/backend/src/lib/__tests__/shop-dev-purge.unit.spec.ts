import {
  confirmShopDevPurgeSecret,
  drainIds,
  parseShopDevPurge,
  shopDevPurgeConfigured,
  verifyLoggedInAdminPassword,
} from "../shop-dev-purge"

describe("shopDevPurgeConfigured", () => {
  it("stays off until the env secret is long enough", () => {
    expect(shopDevPurgeConfigured({ SHOP_DEV_PURGE_SECRET: "also-short" })).toBe(
      false
    )
    expect(
      shopDevPurgeConfigured({ SHOP_DEV_PURGE_SECRET: "dev-secret-value-1" })
    ).toBe(true)
  })
})

describe("parseShopDevPurge", () => {
  it("requires target, checkbox, password and secret", () => {
    expect(parseShopDevPurge({})).toEqual({
      error: "Нужны пароль, секрет и подтверждение",
    })
    expect(
      parseShopDevPurge({
        target: "logs",
        password: "x",
        secret: "y",
        confirmed: false,
      })
    ).toEqual({ error: "Нужны пароль, секрет и подтверждение" })
  })

  it("accepts a known target", () => {
    expect(
      parseShopDevPurge({
        target: "orders",
        password: "pass",
        secret: "secret",
        confirmed: true,
      })
    ).toEqual({
      target: "orders",
      password: "pass",
      secret: "secret",
      confirmed: true,
    })
  })
})

describe("confirmShopDevPurgeSecret", () => {
  const env = { SHOP_DEV_PURGE_SECRET: "dev-secret-value-1" }

  it("rejects a wrong secret", () => {
    expect(confirmShopDevPurgeSecret("wrong-secret-value", env)).toBe(false)
  })

  it("accepts the env secret", () => {
    expect(confirmShopDevPurgeSecret("dev-secret-value-1", env)).toBe(true)
  })
})

describe("verifyLoggedInAdminPassword", () => {
  it("checks the logged-in admin email and password", async () => {
    await expect(
      verifyLoggedInAdminPassword({
        actorId: "user_1",
        password: "admin-pass",
        getEmail: async () => "admin@shop.local",
        authenticateEmailPass: async (email, password) =>
          email === "admin@shop.local" && password === "admin-pass",
      })
    ).resolves.toBe(true)
    await expect(
      verifyLoggedInAdminPassword({
        actorId: "user_1",
        password: "nope",
        getEmail: async () => "admin@shop.local",
        authenticateEmailPass: async () => false,
      })
    ).resolves.toBe(false)
  })
})

describe("drainIds", () => {
  it("deletes listed ids until none remain", async () => {
    const leftover = ["a", "b", "c"]
    const result = await drainIds(
      async () => leftover.slice(0, 2),
      async (ids) => {
        for (const id of ids) {
          const index = leftover.indexOf(id)
          if (index >= 0) leftover.splice(index, 1)
        }
      }
    )
    expect(result).toEqual({ deleted: 3, failed: 0 })
    expect(leftover).toEqual([])
  })

  it("stops when a batch cannot be deleted", async () => {
    const result = await drainIds(
      async () => ["stuck"],
      async () => {
        throw new Error("fk")
      }
    )
    expect(result.deleted).toBe(0)
    expect(result.failed).toBeGreaterThan(0)
  })
})
