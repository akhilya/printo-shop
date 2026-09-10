import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { BLOCKED_IP_MODULE } from "../../../../modules/blocked-ip"
import type BlockedIpModuleService from "../../../../modules/blocked-ip/service"

export async function DELETE(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) {
  const id = String(req.params.id || "")
  const service: BlockedIpModuleService = req.scope.resolve(BLOCKED_IP_MODULE)
  try {
    await service.retrieveBlockedIp(id)
  } catch {
    res.status(404).json({ message: "Адрес не найден" })
    return
  }
  await service.deleteBlockedIps(id)
  res.json({ id, deleted: true })
}
