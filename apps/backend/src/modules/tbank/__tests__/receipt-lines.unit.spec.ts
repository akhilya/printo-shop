import { orderDescription, receiptLinesFromCart } from "../receipt-lines"

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
  })
})
