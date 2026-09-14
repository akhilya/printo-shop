import { Module } from "@medusajs/framework/utils"
import ShopEventModuleService from "./service"

export const SHOP_EVENT_MODULE = "shopEventModule"

export default Module(SHOP_EVENT_MODULE, {
  service: ShopEventModuleService,
})
