import { MedusaService } from "@medusajs/framework/utils"
import LegalPage from "./models/legal-page"

class LegalPageModuleService extends MedusaService({
  LegalPage,
}) {}

export default LegalPageModuleService
