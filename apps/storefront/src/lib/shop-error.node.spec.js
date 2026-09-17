import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { shopError } from "./shop-error.js"

describe("shopError", () => {
  it("hides Ozon HTTP JSON from the shopper", () => {
    assert.equal(
      shopError(
        'Ozon HTTP 400: {"code":3, "message":"invalid_refresh_token"}',
        "Не удалось загрузить пункты выдачи."
      ),
      "Не удалось загрузить пункты выдачи."
    )
  })

  it("keeps a short Russian shopper line", () => {
    assert.equal(
      shopError("Не нашли это место.", "Не удалось найти это место."),
      "Не нашли это место."
    )
  })
})
