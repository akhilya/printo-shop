import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import type {
  IAuthModuleService,
  IUserModuleService,
} from "@medusajs/framework/types"
import {
  confirmShopDevPurgeSecret,
  parseShopDevPurge,
  runShopDevPurge,
  shopDevPurgeConfigured,
  verifyLoggedInAdminPassword,
} from "../../../lib/shop-dev-purge"

export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) {
  res.json({ enabled: shopDevPurgeConfigured() })
}

export async function POST(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) {
  if (!shopDevPurgeConfigured()) {
    res.status(404).json({ message: "Инструменты очистки выключены" })
    return
  }
  const parsed = parseShopDevPurge(req.body)
  if ("error" in parsed) {
    res.status(400).json({ message: parsed.error })
    return
  }
  const secretOk = confirmShopDevPurgeSecret(parsed.secret)
  const passwordOk = await verifyLoggedInAdminPassword({
    actorId: req.auth_context?.actor_id,
    password: parsed.password,
    getEmail: async (actorId) => {
      const users: IUserModuleService = req.scope.resolve(Modules.USER)
      const user = await users.retrieveUser(actorId)
      return user.email || null
    },
    authenticateEmailPass: async (email, password) => {
      const auth: IAuthModuleService = req.scope.resolve(Modules.AUTH)
      const result = await auth.authenticate("emailpass", {
        body: { email, password },
        authScope: "user",
      })
      return result.success === true
    },
  })
  if (!secretOk || !passwordOk) {
    res.status(403).json({ message: "Неверное подтверждение" })
    return
  }
  const result = await runShopDevPurge(req.scope, parsed.target)
  if ("error" in result) {
    res.status(409).json({ message: result.error })
    return
  }
  res.json(result)
}
