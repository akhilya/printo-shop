import { model } from "@medusajs/framework/utils"

const ShopEvent = model.define("shop_event", {
  id: model.id().primaryKey(),
  kind: model.text().index(),
  level: model.text().default("info"),
  title: model.text(),
  message: model.text(),
  order_id: model.text().nullable(),
  shop_number: model.text().nullable(),
  posting_number: model.text().nullable(),
  from_status: model.text().nullable(),
  to_status: model.text().nullable(),
})

export default ShopEvent
