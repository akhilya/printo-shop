import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { listDelegatOrders } from "../../../../lib/delegat-bridge/orders"

export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) {
  const payload = await listDelegatOrders(req.scope, {
    page: Number(req.query.page) || 1,
    pageSize: Number(req.query.page_size) || 50,
    status: typeof req.query.status === "string" ? req.query.status : undefined,
    search: typeof req.query.search === "string" ? req.query.search : undefined,
  })
  res.json(payload)
}
