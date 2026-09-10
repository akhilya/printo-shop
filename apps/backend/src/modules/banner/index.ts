import { Module } from "@medusajs/framework/utils"
import BannerModuleService from "./service"

export const BANNER_MODULE = "bannerModule"

export default Module(BANNER_MODULE, {
  service: BannerModuleService,
})
