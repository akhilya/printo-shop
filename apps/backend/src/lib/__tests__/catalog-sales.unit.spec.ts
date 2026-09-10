import { discountedAmount, presentCatalogSales } from "../catalog-sales"

describe("presentCatalogSales", () => {
  it("maps an item percentage promotion for selected products", () => {
    const sales = presentCatalogSales([
      {
        status: "active",
        type: "standard",
        application_method: {
          type: "percentage",
          target_type: "items",
          value: 20,
          target_rules: [
            {
              attribute: "items.product.id",
              operator: "eq",
              values: [{ value: "prod_1" }],
            },
          ],
        },
      },
    ])
    expect(sales).toEqual([
      {
        type: "percentage",
        value: 20,
        product_ids: ["prod_1"],
        collection_ids: [],
        applies_to_all: false,
      },
    ])
  })

  it("treats order promotions as storewide", () => {
    const sales = presentCatalogSales([
      {
        status: "active",
        type: "standard",
        application_method: {
          type: "percentage",
          target_type: "order",
          value: 10,
        },
      },
    ])
    expect(sales[0].applies_to_all).toBe(true)
    expect(discountedAmount(1000, sales[0])).toBe(900)
  })
})
