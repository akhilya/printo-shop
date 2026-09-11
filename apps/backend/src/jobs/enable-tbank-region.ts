import { MedusaContainer } from "@medusajs/framework/types"
import { enableTbankOnRegions } from "../lib/enable-tbank-region"

export default async function enableTbankRegionJob(container: MedusaContainer) {
  await enableTbankOnRegions(container)
}

export const config = {
  name: "enable-tbank-region",
  schedule: "*/5 * * * *",
}
