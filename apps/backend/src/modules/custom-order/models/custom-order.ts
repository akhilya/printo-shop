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
  quote_amount: model.number().nullable(),
  quote_note: model.text().nullable(),
  delivery_method: model.text().nullable(),
  client_picks_pvz: model.boolean().default(false),
  shop_number: model.text().nullable(),
  checkout_token: model.text().nullable(),
  tbank_payment_id: model.text().nullable(),
  tbank_order_id: model.text().nullable(),
  paid_at: model.dateTime().nullable(),
  ozon_point_id: model.text().nullable(),
  ozon_point_name: model.text().nullable(),
  ozon_point_address: model.text().nullable(),
  ozon_order_number: model.text().nullable(),
  ozon_posting_number: model.text().nullable(),
  ozon_tracking: model.text().nullable(),
})

export default CustomOrder
