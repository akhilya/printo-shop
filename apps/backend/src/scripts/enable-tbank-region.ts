import { MedusaContainer } from "@medusajs/framework"
import { enableTbankOnRegions } from "../lib/enable-tbank-region"

export default async function enableTbankRegion({
  container,
}: {
  container: MedusaContainer
}) {
  await enableTbankOnRegions(container)
  console.log("T-Bank payment provider enabled on all regions.")
}
