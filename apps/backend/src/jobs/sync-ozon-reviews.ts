import { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { ozonAdminErrorMessage } from "../lib/ozon-delivery"
import { importOzonReviewsFromShop } from "../lib/ozon-reviews"
import { recordShopEvent, shopEventErrorDetail } from "../lib/shop-event"

export default async function syncOzonReviewsJob(container: MedusaContainer) {
  try {
    const result = await importOzonReviewsFromShop(container)
    if (!result.imported && !result.updated) return
    await recordShopEvent(container, {
      kind: "ozon_reviews",
      level: "info",
      title: "Отзывы Ozon",
      message: `Добавлено ${result.imported}, обновлено ${result.updated}`,
      detail: shopEventErrorDetail(result),
    })
  } catch (error) {
    const message = ozonAdminErrorMessage(error)
    if (/подключите Ozon/i.test(message)) return
    const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
    logger.warn(`Ozon review import failed: ${shopEventErrorDetail(error)}`)
    await recordShopEvent(container, {
      kind: "ozon_reviews",
      level: "error",
      title: "Отзывы Ozon не загрузились",
      message,
      detail: shopEventErrorDetail(error),
    })
  }
}

export const config = {
  name: "sync-ozon-reviews",
  schedule: "15 4 * * *",
}
