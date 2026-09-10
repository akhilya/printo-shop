import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { exportPrices } from "../../../../../lib/delegat-bridge/service"

export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const prices = (req.body as { prices?: Parameters<typeof exportPrices>[1] })?.prices ?? []
  const payload = await exportPrices(req.scope, prices)
  res.json(payload)
}
