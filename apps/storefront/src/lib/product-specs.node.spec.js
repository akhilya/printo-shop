import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { productSpecs } from "./product-specs.js"

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
    assert.equal(byLabel["Признак 18+"], "Нет")
    assert.equal(
      byLabel["Название вариации"],
      "Миниатюра Святейший - Мистические создания (126мм)"
    )
    assert.equal(byLabel["Артикул"], "MI9")
  })

  it("does not let an empty specs list hide attributes", () => {
    const rows = productSpecs({
      metadata: { specs: "[]", attributes: { test_field: "ТЕСТ" } },
    })
    assert.equal(rows.some((row) => row.value === "ТЕСТ"), true)
  })
})
