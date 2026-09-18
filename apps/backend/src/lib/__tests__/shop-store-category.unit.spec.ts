import {
  slimDelegatFields,
  slimDelegatFieldsJson,
  stripStoreDelegatFields,
} from "../shop-store-category"

describe("shop store category fields", () => {
  it("drops select options from PIM field schema", () => {
    expect(
      slimDelegatFields([
        {
          key: "9080",
          name: "Признак 18+",
          type: "string",
          options: [{ value: "да", label: "да" }],
        },
        { id: "color", label: "Цвет", options: [{ value: "red", label: "red" }] },
      ])
    ).toEqual([
      { key: "9080", name: "Признак 18+" },
      { key: "color", name: "Цвет" },
    ])
    expect(slimDelegatFieldsJson([{ key: "a", name: "A", options: [1, 2, 3] }])).toBe(
      '[{"key":"a","name":"A"}]'
    )
  })

  it("removes marketplace dictionaries from store product payloads", () => {
    const payload = {
      products: [
        {
          id: "prod_1",
          categories: [
            {
              id: "pcat_1",
              metadata: {
                delegat_fields: '{"options":["huge"]}',
                keep: "yes",
              },
            },
          ],
        },
      ],
    }
    stripStoreDelegatFields(payload)
    expect(payload.products[0].categories[0].metadata).toEqual({ keep: "yes" })
  })
})
