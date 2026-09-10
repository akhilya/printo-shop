import { groupHandle, mapProduct, pickAmount, readGroupRef, slugify, toMedusaStatus } from "../map-product"

describe("delegat map-product", () => {
  it("slugifies sku and name", () => {
    expect(slugify("KNIGHT-01")).toBe("knight-01")
    expect(slugify("Чёрный рыцарь")).toBe("product")
  })

  it("maps publish status to published", () => {
    expect(toMedusaStatus("publish")).toBe("published")
    expect(toMedusaStatus("draft")).toBe("draft")
  })

  it("prefers sale price when present", () => {
    expect(pickAmount(1500, 1200)).toBe(1200)
    expect(pickAmount(1500, null)).toBe(1500)
  })

  it("creates a default variant for a simple product", () => {
    const mapped = mapProduct({
      name: "Miniature Knight",
      sku: "KNIGHT-01",
      price: 1500,
      quantity: 3,
      delegat_product_id: "99",
      category_ids: ["pcat_7"],
      image_urls: ["https://cdn.example/knight.jpg"],
    })

    expect(mapped.title).toBe("Miniature Knight")
    expect(mapped.handle).toBe("knight-01")
    expect(mapped.status).toBe("published")
    expect(mapped.categoryIds).toEqual(["pcat_7"])
    expect(mapped.variants).toHaveLength(1)
    expect(mapped.variants[0].sku).toBe("KNIGHT-01")
    expect(mapped.variants[0].amount).toBe(1500)
    expect(mapped.variants[0].quantity).toBe(3)
    expect(mapped.metadata.delegat_product_id).toBe("99")
  })

  it("builds collection handles for PIM groups", () => {
    expect(groupHandle("Genshin Impact", "8")).toBe("genshin-impact-8")
    expect(groupHandle("Мистические создания", "12")).toBe("group-12")
    expect(groupHandle("Group Подставки", "22")).toBe("group-22")
  })

  it("keeps PIM group id on metadata", () => {
    const mapped = mapProduct({
      name: "Cerberus",
      sku: "MI9",
      group_id: "12",
      group_name: "Мистические создания",
    })
    expect(mapped.metadata.delegat_group_id).toBe("12")
    expect(mapped.metadata.delegat_group_name).toBe("Мистические создания")
  })

  it("reads camelCase and numeric group ids from the dashboard payload", () => {
    expect(readGroupRef({ groupId: 16, groupName: "Genshin Impact" })).toEqual({
      groupId: "16",
      groupName: "Genshin Impact",
    })
  })

  it("ignores empty mapped groupId and uses the PIM group from raw_fields", () => {
    expect(
      readGroupRef({
        groupId: "",
        group_id: "  ",
        raw_fields: { _localGroupId: "22", _localGroupName: "Group Подставки" },
      })
    ).toEqual({
      groupId: "22",
      groupName: "Group Подставки",
    })
  })

  it("stores PIM shop specs on metadata", () => {
    const mapped = mapProduct({
      name: "Nahida",
      sku: "GE32",
      specs: [
        { key: "material", label: "Материал", value: "Фотополимер" },
        { key: "height", label: "Высота", value: "75 мм" },
      ],
    })
    expect(JSON.parse(mapped.metadata.specs)).toEqual([
      { key: "material", label: "Материал", value: "Фотополимер" },
      { key: "height", label: "Высота", value: "75 мм" },
    ])
  })

  it("maps size variants from tech_size", () => {
    const mapped = mapProduct({
      name: "Sized Figure",
      sku: "FIG-S",
      variants: [
        { variant_id: "v1", tech_size: "S", price: 900, quantity: 2 },
        { variant_id: "v2", tech_size: "L", price: 1100, quantity: 1 },
      ],
    })

    expect(mapped.variants).toHaveLength(2)
    expect(mapped.variants[0].options.Size).toBe("S")
    expect(mapped.variants[1].amount).toBe(1100)
    expect(mapped.optionValues.Size).toEqual(["S", "L"])
  })
})
