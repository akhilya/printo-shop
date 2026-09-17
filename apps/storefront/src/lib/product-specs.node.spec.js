import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { productSpecs, isAdultProduct } from "./product-specs.js"

const ATTRIBUTES = {
  test_field: "ТЕСТ",
  "67field": "67",
  Глубина: "100",
  "Цвет товара": "серый",
  "Количество фигурок": "1",
  "Признак 18+": "False",
  Вес: "93",
  "Высота фигурки (мм)": "126",
  Целостность: "Разборная (только подставка)",
  Ширина: "100",
  Высота: "150",
  "Название вариации": "Миниатюра Святейший - Мистические создания (126мм)",
}

describe("productSpecs", () => {
  it("renders every PIM attribute that was sent", () => {
    const rows = productSpecs({
      title: "Миниатюра Святейший",
      metadata: { attributes: ATTRIBUTES },
      variants: [{ sku: "MI9" }],
    })
    const byLabel = Object.fromEntries(rows.map((row) => [row.label, row.value]))
    assert.equal(byLabel["Test field"], "ТЕСТ")
    assert.equal(byLabel["67field"], "67")
    assert.equal(byLabel["Глубина"], "100")
    assert.equal(byLabel["Цвет"], "серый")
    assert.equal(byLabel["Фигурок"], "1")
    assert.equal(byLabel["Вес"], "93 г")
    assert.equal(byLabel["Высота фигурки"], "126 мм")
    assert.equal(byLabel["Целостность"], "Разборная (только подставка)")
    assert.equal(byLabel["Ширина"], "100")
    assert.equal(byLabel["Высота"], "150")
    assert.equal(byLabel["Признак 18+"], undefined)
    assert.equal(
      byLabel["Название вариации"],
      "Миниатюра Святейший - Мистические создания (126мм)"
    )
    assert.equal(byLabel["Артикул"], "MI9")
    assert.equal(rows.some((row) => /вес с упаковк/i.test(row.label)), false)
  })

  it("keeps product weight and drops packaged weight", () => {
    const rows = productSpecs({
      metadata: {
        attributes: {
          Вес: "93",
          "Вес с упаковкой": "140",
          "вес с упаковкой, г": "140",
        },
        specs: JSON.stringify([
          { key: "weight", label: "Вес", value: "93" },
          { key: "package_weight", label: "Вес с упаковкой", value: "140" },
        ]),
      },
    })
    const weight = rows.filter((row) => row.label === "Вес")
    assert.equal(weight.length, 1)
    assert.equal(weight[0].value, "93 г")
    assert.equal(rows.some((row) => /вес с упаковк/i.test(row.label)), false)
  })

  it("does not let an empty specs list hide attributes", () => {
    const rows = productSpecs({
      metadata: { specs: "[]", attributes: { test_field: "ТЕСТ" } },
    })
    assert.equal(rows.some((row) => row.value === "ТЕСТ"), true)
  })

  it("detects 18+ and hides the flag from specs", () => {
    const adult = {
      metadata: { attributes: { "Признак 18+": "True" } },
    }
    const safe = {
      metadata: { attributes: { "Признак 18+": "False" } },
    }
    assert.equal(isAdultProduct(adult), true)
    assert.equal(isAdultProduct(safe), false)
    assert.equal(isAdultProduct({ metadata: { attributes: { Высота: "18" } } }), false)
    assert.equal(
      productSpecs(adult).some((row) => /18/.test(row.label)),
      false
    )
  })
})
