import { parseShopLink, shopLinkPath, shopLinkTarget } from "../shop-link"

describe("shopLinkPath", () => {
  it("keeps a short public path", () => {
    expect(shopLinkPath("Akcia")).toBe("/akcia")
    expect(shopLinkPath("/go/leto/")).toBe("/go/leto")
  })

  it("rejects store pages and outside addresses", () => {
    expect(shopLinkPath("/promo/leto")).toBeNull()
    expect(shopLinkPath("/products")).toBeNull()
    expect(shopLinkPath("/")).toBeNull()
    expect(shopLinkPath("https://example.com")).toBeNull()
  })
})

describe("shopLinkTarget", () => {
  it("allows an internal page", () => {
    expect(shopLinkTarget("/a/k7m2qx9pab")).toBe("/a/k7m2qx9pab")
    expect(shopLinkTarget("products")).toBe("/products")
    expect(shopLinkTarget("/")).toBe("/")
  })

  it("rejects a promo address that repeats the code", () => {
    expect(shopLinkTarget("/promo/LETO10")).toBeNull()
  })

  it("rejects an outside address", () => {
    expect(shopLinkTarget("https://example.com/sale")).toBeNull()
    expect(shopLinkTarget("//example.com")).toBeNull()
  })
})

describe("parseShopLink", () => {
  it("clears the link when both fields are empty", () => {
    expect(parseShopLink({ path: "", target: "" })).toEqual({
      path: null,
      target: null,
      error: "",
    })
  })

  it("stores a path that opens a generated promo page", () => {
    expect(parseShopLink({ path: "/qr", target: "/a/k7m2qx9pab" })).toEqual({
      path: "/qr",
      target: "/a/k7m2qx9pab",
      error: "",
    })
  })

  it("rejects a target that contains the promo code", () => {
    expect(parseShopLink({ path: "/qr", target: "/promo/LETO10" }).error).toBe(
      "Адрес акции не должен содержать промокод"
    )
  })
})
