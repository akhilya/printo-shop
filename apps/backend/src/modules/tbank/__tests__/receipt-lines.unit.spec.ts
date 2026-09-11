import {
  customReceiptLine,
  orderDescription,
  receiptLinesFromCart,
} from "../receipt-lines"

describe("receiptLinesFromCart", () => {
  it("builds named lines from cart items and shipping", () => {
    const lines = receiptLinesFromCart(
      {
        items: [
          {
            title: "Фигурка",
            quantity: 2,
            unit_price: 750,
            variant: {
              sku: "WA150",
              title: "Default",
              product: { title: "Temple Assassins" },
            },
          },
        ],
        shipping_methods: [{ name: "Почта", amount: 300 }],
      },
      180000
    )
    expect(lines[0].name).toBe("Temple Assassins · WA150")
    expect(lines[0].quantity).toBe(2)
    expect(lines[1].name).toBe("Почта")
    expect(orderDescription(lines)).toContain("Temple Assassins")
    expect(orderDescription(lines)).toContain("×2")
    expect(orderDescription(lines, { number: "1234567890" })).toMatch(
      /^Заказ 1234567890\./
    )
  })

  it("labels a custom order receipt with number and details", () => {
    const line = customReceiptLine("75 мм, грунт", 450000, "1234567890")
    expect(line.name).toContain("Индивидуальный заказ 1234567890")
    expect(line.name).toContain("75 мм")
    expect(
      orderDescription([line], { number: "1234567890", custom: true })
    ).toMatch(/^Индивидуальный заказ 1234567890\./)
  })
})
