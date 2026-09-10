import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import { createHash } from "node:crypto"
import { convertToWebp } from "../../../lib/delegat-bridge/ingest-images-io"
import { decodeReviewImageBase64 } from "../../../lib/review-image"
import {
  MAX_CUSTOM_ORDER_IMAGE_BYTES,
  parseCustomOrderInput,
  presentCustomOrder,
} from "../../../lib/custom-order"
import { clientIp } from "../../../lib/client-ip"
import { checkSubmitLimit } from "../../../lib/submit-limit"
import { CUSTOM_ORDER_MODULE } from "../../../modules/custom-order"
import type CustomOrderModuleService from "../../../modules/custom-order/service"

async function storePublicImage(scope: MedusaRequest["scope"], content: string) {
  const files = scope.resolve(Modules.FILE) as {
    createFiles: (data: {
      filename: string
      mimeType: string
      content: string
      access: "public"
    }) => Promise<{ url?: string } | Array<{ url?: string }>>
  }
  const raw = decodeReviewImageBase64(content, MAX_CUSTOM_ORDER_IMAGE_BYTES)
  const webp = await convertToWebp(raw)
  const filename = `order-${createHash("sha1").update(webp).digest("hex").slice(0, 16)}.webp`
  const created = await files.createFiles({
    filename,
    mimeType: "image/webp",
    content: webp.toString("base64"),
    access: "public",
  })
  const file = Array.isArray(created) ? created[0] : created
  return file?.url || null
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const ip = clientIp(req)
  const limit = checkSubmitLimit(`custom-order:${ip}`)
  if ("error" in limit) {
    res.status(429).json({ message: limit.error })
    return
  }
  const parsed = parseCustomOrderInput(req.body)
  if ("error" in parsed) {
    res.status(400).json({ message: parsed.error })
    return
  }

  let productTitle: string | null = null
  if (parsed.product_id) {
    try {
      const productModule = req.scope.resolve(Modules.PRODUCT) as {
        retrieveProduct: (
          id: string,
          config?: { select?: string[] }
        ) => Promise<{ title?: string }>
      }
      const product = await productModule.retrieveProduct(parsed.product_id, {
        select: ["id", "title"],
      })
      productTitle = product?.title || null
    } catch {
      productTitle = null
    }
  }

  const imageUrls: string[] = []
  if (parsed.images.length) {
    try {
      for (const content of parsed.images) {
        const url = await storePublicImage(req.scope, content)
        if (url) imageUrls.push(url)
      }
    } catch (error) {
      const code = error instanceof Error ? error.message : ""
      if (code === "too_large") {
        res.status(400).json({ message: "Фото больше 2 МБ" })
        return
      }
      res.status(400).json({ message: "Не удалось прочитать фото" })
      return
    }
  }

  const service: CustomOrderModuleService = req.scope.resolve(CUSTOM_ORDER_MODULE)
  const order = await service.createCustomOrders({
    name: parsed.name,
    email: parsed.email,
    phone: parsed.phone,
    telegram: parsed.telegram,
    max_account: parsed.max_account,
    vk: parsed.vk,
    message: parsed.message,
    product_id: parsed.product_id,
    product_title: productTitle,
    image_urls: imageUrls,
    status: "new",
    ip,
  })
  res.status(201).json({
    order: presentCustomOrder(order as unknown as Record<string, unknown>),
  })
}
