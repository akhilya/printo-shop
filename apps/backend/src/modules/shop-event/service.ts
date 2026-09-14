import { MedusaService } from "@medusajs/framework/utils"
import ShopEvent from "./models/shop-event"

class ShopEventModuleService extends MedusaService({
  ShopEvent,
}) {}

export default ShopEventModuleService
