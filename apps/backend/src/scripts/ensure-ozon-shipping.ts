import { MedusaContainer } from "@medusajs/framework"
import { ensureOzonShipping } from "../lib/ensure-ozon-shipping"

export default async function ensureOzonShippingScript({
  container,
}: {
  container: MedusaContainer
}) {
  const result = await ensureOzonShipping(container)
  console.log("Ozon shipping ready:", result?.name || "skipped")
}
