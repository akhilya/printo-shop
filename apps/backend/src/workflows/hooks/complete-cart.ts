import { completeCartWorkflow } from "@medusajs/medusa/core-flows"
import { getShopSetting } from "../../lib/shop-setting"
import { assertCartPaidAtTbank } from "../../lib/tbank-paid"

completeCartWorkflow.hooks.validate(async ({ cart }, { container }) => {
  if (Number((cart as unknown as Record<string, unknown>).total) <= 0) return
  const row = (await getShopSetting(container)) as unknown as Record<
    string,
    unknown
  >
  await assertCartPaidAtTbank({
    cart: cart as unknown as Record<string, unknown>,
    row,
  })
})
