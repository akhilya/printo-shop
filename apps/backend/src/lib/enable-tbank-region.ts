import { MedusaContainer } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { updateRegionsWorkflow } from "@medusajs/medusa/core-flows"

export const TBANK_PROVIDER_ID = "pp_tbank_tbank"

export async function enableTbankOnRegions(container: MedusaContainer) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data: regions } = await query.graph({
    entity: "region",
    fields: ["id", "payment_providers.id"],
  })

  for (const region of (regions ?? []) as Array<Record<string, unknown>>) {
    const id = String(region.id || "")
    if (!id) continue
    const current = (
      (region.payment_providers as Array<{ id?: string }> | undefined) ?? []
    )
      .map((row) => String(row?.id || ""))
      .filter(Boolean)
    if (current.includes(TBANK_PROVIDER_ID)) continue
    await updateRegionsWorkflow(container).run({
      input: {
        selector: { id },
        update: {
          payment_providers: [...current, TBANK_PROVIDER_ID],
        },
      },
    })
  }
}
