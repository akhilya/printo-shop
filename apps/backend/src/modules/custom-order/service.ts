import { MedusaService } from "@medusajs/framework/utils"
import CustomOrder from "./models/custom-order"
import ShopOrderLookup from "./models/shop-order-lookup"

class CustomOrderModuleService extends MedusaService({
  CustomOrder,
  ShopOrderLookup,
}) {}

export default CustomOrderModuleService
