import { MedusaService } from "@medusajs/framework/utils"
import ShopSetting from "./models/shop-setting"

class ShopSettingModuleService extends MedusaService({
  ShopSetting,
}) {}

export default ShopSettingModuleService
