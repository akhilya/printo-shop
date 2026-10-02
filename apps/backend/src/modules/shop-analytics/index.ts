import { Module } from "@medusajs/framework/utils"
import ShopAnalyticsModuleService from "./service"

export const SHOP_ANALYTICS_MODULE = "shopAnalyticsModule"

export default Module(SHOP_ANALYTICS_MODULE, {
  service: ShopAnalyticsModuleService,
})
