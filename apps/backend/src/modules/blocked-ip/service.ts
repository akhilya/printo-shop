import { MedusaService } from "@medusajs/framework/utils"
import BlockedIp from "./models/blocked-ip"

class BlockedIpModuleService extends MedusaService({
  BlockedIp,
}) {}

export default BlockedIpModuleService
