import { model } from "@medusajs/framework/utils"

const ShopSetting = model.define("shop_setting", {
  id: model.id().primaryKey(),
  key: model.text().unique(),
  closed: model.boolean().default(false),
  message: model.text().default("Магазин в разработке."),
  orders_closed: model.boolean().default(false),
  orders_message: model.text().default("Заказы временно недоступны."),
  tbank_terminal_key: model.text().nullable(),
  tbank_password: model.text().nullable(),
  tbank_api_url: model.text().nullable(),
  tbank_success_url: model.text().nullable(),
  tbank_fail_url: model.text().nullable(),
  tbank_notification_url: model.text().nullable(),
  tbank_pay_type: model.text().default("O"),
  tbank_receipt: model.boolean().default(false),
  tbank_taxation: model.text().default("usn_income"),
  tbank_vat: model.text().default("none"),
  ozon_client_id: model.text().nullable(),
  ozon_api_key: model.text().nullable(),
  ozon_oauth_token: model.text().nullable(),
  ozon_refresh_token: model.text().nullable(),
  ozon_oauth_state: model.text().nullable(),
  ozon_from_place_id: model.text().nullable(),
  ozon_quote_mode: model.text().default("fixed"),
  ozon_fixed_amount: model.number().default(350),
  redirect_path: model.text().nullable(),
  redirect_target: model.text().nullable(),
})

export default ShopSetting
