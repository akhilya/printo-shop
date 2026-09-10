import { model } from "@medusajs/framework/utils"

const ShopSetting = model.define("shop_setting", {
  id: model.id().primaryKey(),
  key: model.text().unique(),
  closed: model.boolean().default(false),
  message: model.text().default("Магазин в разработке."),
})

export default ShopSetting
