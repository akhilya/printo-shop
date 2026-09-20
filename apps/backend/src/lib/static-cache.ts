import type {
  MedusaNextFunction,
  MedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"

export const STATIC_CACHE_CONTROL =
  "public, max-age=31536000, immutable"

export function applyStaticCache(
  _req: MedusaRequest,
  res: MedusaResponse,
  next: MedusaNextFunction
) {
  const original = res.setHeader.bind(res)
  res.setHeader = ((name: string, value: unknown) => {
    if (String(name).toLowerCase() === "cache-control") {
      return original("Cache-Control", STATIC_CACHE_CONTROL)
    }
    return original(name, value as string)
  }) as typeof res.setHeader
  original("Cache-Control", STATIC_CACHE_CONTROL)
  next()
}
