import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { exportStocks } from "../../../../../lib/delegat-bridge/service"

export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const stocks = (req.body as { stocks?: Parameters<typeof exportStocks>[1] })?.stocks ?? []
  const payload = await exportStocks(req.scope, stocks)
  res.json(payload)
}
