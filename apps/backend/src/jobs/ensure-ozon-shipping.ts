import { MedusaContainer } from "@medusajs/framework/types"
import { ensureOzonShipping } from "../lib/ensure-ozon-shipping"

export default async function ensureOzonShippingJob(container: MedusaContainer) {
  await ensureOzonShipping(container)
}

export const config = {
  name: "ensure-ozon-shipping",
  schedule: "*/10 * * * *",
}
