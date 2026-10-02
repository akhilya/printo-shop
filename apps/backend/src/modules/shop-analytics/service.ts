import { MedusaService } from "@medusajs/framework/utils"
import ShopPageView from "./models/shop-page-view"
import ShopVisitor from "./models/shop-visitor"

class ShopAnalyticsModuleService extends MedusaService({
  ShopPageView,
  ShopVisitor,
}) {}

export default ShopAnalyticsModuleService
