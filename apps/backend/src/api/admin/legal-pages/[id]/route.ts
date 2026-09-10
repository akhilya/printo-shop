import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { parseLegalPageInput, presentLegalPage } from "../../../../lib/legal-page"
import { LEGAL_PAGE_MODULE } from "../../../../modules/legal-page"
import type LegalPageModuleService from "../../../../modules/legal-page/service"

export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) {
  const service: LegalPageModuleService = req.scope.resolve(LEGAL_PAGE_MODULE)
  try {
    const page = await service.retrieveLegalPage(String(req.params.id || ""))
    res.json({
      page: presentLegalPage(page as unknown as Record<string, unknown>),
    })
  } catch {
    res.status(404).json({ message: "Страница не найдена" })
  }
}

export async function POST(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) {
  const id = String(req.params.id || "")
  const parsed = parseLegalPageInput(req.body, true)
  if ("error" in parsed) {
    res.status(400).json({ message: parsed.error })
    return
  }
  if (!parsed.title.trim() || !parsed.body.trim()) {
    res.status(400).json({ message: "Нужны заголовок и текст" })
    return
  }
  const service: LegalPageModuleService = req.scope.resolve(LEGAL_PAGE_MODULE)
  try {
    await service.retrieveLegalPage(id)
  } catch {
    res.status(404).json({ message: "Страница не найдена" })
    return
  }
  const update: Record<string, unknown> = {
    enabled: parsed.enabled,
  }
  if (parsed.title) update.title = parsed.title
  if (parsed.body !== undefined) update.body = parsed.body
  const updated = await service.updateLegalPages({
    id,
    ...update,
  })
  const page = Array.isArray(updated) ? updated[0] : updated
  res.json({
    page: presentLegalPage(
      (page || { id, ...update }) as unknown as Record<string, unknown>
    ),
  })
}
