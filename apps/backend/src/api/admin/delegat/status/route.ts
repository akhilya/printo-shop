import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { getDelegatStatus } from "../../../../lib/delegat-bridge/admin-status"
import { publicBackendUrl } from "../../../../lib/public-url"

export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) {
  const payload = await getDelegatStatus(
    req.scope,
    publicBackendUrl(req)
  )
  res.json(payload)
}
