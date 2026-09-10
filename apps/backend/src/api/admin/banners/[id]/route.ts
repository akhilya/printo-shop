import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { parseBannerInput, presentBanner } from "../../../../lib/banner"
import { BANNER_MODULE } from "../../../../modules/banner"
import type BannerModuleService from "../../../../modules/banner/service"

export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) {
  const service: BannerModuleService = req.scope.resolve(BANNER_MODULE)
  try {
    const banner = await service.retrieveBanner(String(req.params.id || ""))
    res.json({
      banner: presentBanner(banner as unknown as Record<string, unknown>),
    })
  } catch {
    res.status(404).json({ message: "Баннер не найден" })
  }
}

export async function POST(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) {
  const id = String(req.params.id || "")
  const parsed = parseBannerInput(req.body, true)
  if ("error" in parsed) {
    res.status(400).json({ message: parsed.error })
    return
  }
  const service: BannerModuleService = req.scope.resolve(BANNER_MODULE)
  try {
    await service.retrieveBanner(id)
  } catch {
    res.status(404).json({ message: "Баннер не найден" })
    return
  }
  const update: Record<string, unknown> = {}
  if (parsed.title) update.title = parsed.title
  if (parsed.body) update.body = parsed.body
  if (parsed.slot) update.slot = parsed.slot
  update.cta_label = parsed.cta_label
  update.cta_href = parsed.cta_href
  update.image_url = parsed.image_url
  update.enabled = parsed.enabled
  const updated = await service.updateBanners({
    id,
    ...update,
  })
  const banner = Array.isArray(updated) ? updated[0] : updated
  res.json({
    banner: presentBanner(
      (banner || { id, ...update }) as unknown as Record<string, unknown>
    ),
  })
}
