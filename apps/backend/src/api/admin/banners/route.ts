import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { parseBannerInput, presentBanner } from "../../../lib/banner"
import { ensureDefaultBanners } from "../../../lib/ensure-banners"
import { BANNER_MODULE } from "../../../modules/banner"
import type BannerModuleService from "../../../modules/banner/service"

export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) {
  const rows = await ensureDefaultBanners(req.scope)
  res.json({
    banners: rows.map((row) =>
      presentBanner(row as unknown as Record<string, unknown>)
    ),
  })
}

export async function POST(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) {
  const parsed = parseBannerInput(req.body)
  if ("error" in parsed) {
    res.status(400).json({ message: parsed.error })
    return
  }
  const service: BannerModuleService = req.scope.resolve(BANNER_MODULE)
  const banner = await service.createBanners(parsed)
  res.status(201).json({
    banner: presentBanner(banner as unknown as Record<string, unknown>),
  })
}
