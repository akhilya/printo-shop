import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { getDelegatStatus } from "../../../../lib/delegat-bridge/admin-status"

export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) {
  const payload = await getDelegatStatus(
    req.scope,
    process.env.MEDUSA_BACKEND_URL
  )
  res.json(payload)
}
