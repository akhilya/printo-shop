import { model } from "@medusajs/framework/utils"

const ShopOrderLookup = model.define("shop_order_lookup", {
  id: model.id().primaryKey(),
  number: model.text().unique(),
  source: model.text(),
  ref_id: model.text(),
  access_token: model.text().nullable(),
})

export default ShopOrderLookup
