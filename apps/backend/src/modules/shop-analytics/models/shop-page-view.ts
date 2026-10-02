import { model } from "@medusajs/framework/utils"

const ShopPageView = model.define("shop_page_view", {
  id: model.id().primaryKey(),
  path: model.text().index(),
  visitor: model.text().index(),
  kind: model.text().default("view"),
  source: model.text().nullable(),
})

export default ShopPageView
