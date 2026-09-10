import { Module } from "@medusajs/framework/utils"
import ShopSettingModuleService from "./service"

export const SHOP_SETTING_MODULE = "shopSettingModule"

export default Module(SHOP_SETTING_MODULE, {
  service: ShopSettingModuleService,
})
