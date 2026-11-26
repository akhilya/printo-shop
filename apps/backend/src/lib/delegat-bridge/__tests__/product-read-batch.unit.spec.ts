import type { MedusaContainer } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import {
  getHealth,
  getProduct,
  getProductsBatch,
} from "../service"

type ProductRow = Record<string, unknown>

type GraphArgs = {
  entity: string
  filters?: { id?: string | string[] }
}

function containerWithProducts(rows: ProductRow[]) {
  const graph = jest.fn(async (args: GraphArgs) => {
    if (args.entity === "product") {
      const filter = args.filters?.id
      const ids = Array.isArray(filter) ? filter : filter ? [filter] : []
      return {
        data: rows.filter((row) => ids.includes(String(row.id))),
      }
    }
    if (args.entity === "store") {
      return {
        data: [
          {
            name: "Shop",
            supported_currencies: [{ currency_code: "rub", is_default: true }],
          },
        ],
      }
    }
    if (args.entity === "stock_location") {
      return { data: [{ id: "sloc_1" }] }
    }
    if (args.entity === "shipping_profile") {
      return { data: [{ id: "sp_1" }] }
    }
    return { data: [] }
  })
  const container = {
    resolve: (key: string) =>
      key === ContainerRegistrationKeys.QUERY ? { graph } : undefined,
  } as unknown as MedusaContainer

  return { container, graph }
}

const productRow: ProductRow = {
  id: "prod_1",
  title: "Miniature Knight",
  description: "Resin",
  status: "published",
  images: [{ url: "https://cdn.example/knight.jpg" }],
  categories: [{ id: "pcat_15", name: "Miniatures" }],
  variants: [
    {
      id: "variant_1",
      sku: "KNIGHT-01",
      prices: [{ amount: 1500, currency_code: "rub" }],
    },
  ],
}

describe("delegat product batch read", () => {
  it("returns the exact single-product payload shape inside a found row", async () => {
    const { container } = containerWithProducts([productRow])

    const single = await getProduct(container, "prod_1")
    const batch = await getProductsBatch(container, ["prod_1"])

    expect(single).toEqual({
      success: true,
      product_id: "prod_1",
      sku: "KNIGHT-01",
      name: "Miniature Knight",
      description: "Resin",
      price: 1500,
      status: "published",
      image_urls: ["https://cdn.example/knight.jpg"],
      category_id: "pcat_15",
      category_name: "Miniatures",
    })
    expect(batch.results).toHaveLength(1)
    expect(batch.results[0]).toEqual({
      index: 0,
      external_product_id: "prod_1",
      found: true,
      product: single,
    })
  })

  it("preserves input order, repeats duplicate positions, and keeps misses explicit", async () => {
    const secondRow = {
      ...productRow,
      id: "prod_2",
      title: "Cerberus",
    }
    const { container, graph } = containerWithProducts([productRow, secondRow])

    const batch = await getProductsBatch(container, [
      "prod_2",
      "prod_missing",
      "prod_1",
      "prod_2",
    ])

    expect(graph).toHaveBeenCalledWith(
      expect.objectContaining({
        entity: "product",
        filters: { id: ["prod_2", "prod_missing", "prod_1"] },
      })
    )
    expect(batch.results.map((row) => row.index)).toEqual([0, 1, 2, 3])
    expect(batch.results.map((row) => row.external_product_id)).toEqual([
      "prod_2",
      "prod_missing",
      "prod_1",
      "prod_2",
    ])
    expect(batch.results.map((row) => row.found)).toEqual([
      true,
      false,
      true,
      true,
    ])
    expect(batch.results[1]).toMatchObject({
      error: "product_not_found",
    })
    expect(batch.results[0].product).toEqual(batch.results[3].product)
    expect(batch.results[0].product).toMatchObject({
      product_id: "prod_2",
      name: "Cerberus",
    })
  })

  it("returns an empty positional result set without querying products", async () => {
    const { container, graph } = containerWithProducts([productRow])

    const batch = await getProductsBatch(container, [])

    expect(batch).toEqual({ success: true, results: [] })
    expect(graph).not.toHaveBeenCalledWith(
      expect.objectContaining({ entity: "product" })
    )
  })

  it("advertises the batch read capability in bridge health", async () => {
    const { container } = containerWithProducts([])

    const health = await getHealth(container)

    expect(health.capabilities).toContain("products.batch_read")
  })
})
