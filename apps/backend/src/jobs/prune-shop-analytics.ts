import { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { pruneShopAnalytics } from "../lib/shop-analytics"

export default async function pruneShopAnalyticsJob(container: MedusaContainer) {
  try {
    await pruneShopAnalytics(container)
  } catch (error) {
    const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
    logger.warn(
      `Shop analytics prune failed: ${error instanceof Error ? error.message : "error"}`
    )
  }
}

export const config = {
  name: "prune-shop-analytics",
  schedule: "30 3 * * *",
}
