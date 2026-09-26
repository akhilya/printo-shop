import { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { shrinkOversizedStaticPhotos } from "../lib/shrink-static-photos"

export default async function shrinkStaticPhotosJob(container: MedusaContainer) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const result = await shrinkOversizedStaticPhotos()
  if (!result.shrunk && !result.failed) return
  logger.info(
    `Shop photos resized: ${result.shrunk}, skipped ${result.skipped}, failed ${result.failed}`
  )
}

export const config = {
  name: "shrink-static-photos",
  schedule: "* * * * *",
}
