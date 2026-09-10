import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { createDelegatApiKey } from "../../../../lib/delegat-bridge/admin-status"

export async function POST(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) {
  try {
    const key = await createDelegatApiKey(req.scope)
    res.status(201).json({ key })
  } catch (error) {
    res.status(400).json({
      message:
        error instanceof Error ? error.message : "Не удалось создать ключ",
    })
  }
}
