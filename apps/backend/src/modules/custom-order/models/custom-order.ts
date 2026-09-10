import { model } from "@medusajs/framework/utils"

const CustomOrder = model.define("custom_order", {
  id: model.id().primaryKey(),
  name: model.text(),
  email: model.text().nullable(),
  phone: model.text().nullable(),
  telegram: model.text().nullable(),
  max_account: model.text().nullable(),
  vk: model.text().nullable(),
  message: model.text(),
  product_id: model.text().nullable(),
  product_title: model.text().nullable(),
  image_urls: model.json().nullable(),
  status: model.text().default("new"),
  ip: model.text().nullable(),
})

export default CustomOrder
