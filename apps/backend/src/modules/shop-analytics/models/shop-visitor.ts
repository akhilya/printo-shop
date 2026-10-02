import { model } from "@medusajs/framework/utils"

const ShopVisitor = model.define("shop_visitor", {
  id: model.id().primaryKey(),
  visitor: model.text().unique(),
  last_seen: model.dateTime(),
})

export default ShopVisitor
