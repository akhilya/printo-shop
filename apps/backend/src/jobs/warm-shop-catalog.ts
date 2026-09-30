import type { MedusaContainer } from "@medusajs/framework/types"
import { warmShopCatalog } from "../lib/shop-catalog"

export default async function warmShopCatalogJob(container: MedusaContainer) {
  await warmShopCatalog(container)
}

export const config = {
  name: "warm-shop-catalog",
  schedule: "* * * * *",
}
