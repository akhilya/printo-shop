export type CatalogSale = {
  type: "percentage" | "fixed"
  value: number
  product_ids: string[]
  collection_ids: string[]
  applies_to_all: boolean
}

function ruleValues(
  rules: Array<{ attribute?: string; operator?: string; values?: Array<{ value?: string } | string> }> | undefined,
  attributes: string[]
): string[] {
  const ids: string[] = []
  for (const rule of rules || []) {
    if (!attributes.includes(String(rule.attribute || ""))) continue
    if (rule.operator !== "eq" && rule.operator !== "in") continue
    for (const entry of rule.values || []) {
      const value = typeof entry === "string" ? entry : entry?.value
      if (value) ids.push(String(value))
    }
  }
  return ids
}

function campaignLive(campaign: Record<string, unknown> | undefined): boolean {
  if (!campaign) return true
  const now = Date.now()
  if (campaign.ends_at && new Date(String(campaign.ends_at)).getTime() < now) {
    return false
  }
  if (campaign.starts_at && new Date(String(campaign.starts_at)).getTime() > now) {
    return false
  }
  return true
}

export function presentCatalogSales(rows: Record<string, unknown>[]): CatalogSale[] {
  const sales: CatalogSale[] = []
  for (const row of rows) {
    if (row.status && row.status !== "active") continue
    if (row.type && row.type !== "standard") continue
    if (row.is_automatic !== true) continue
    const campaign = row.campaign as Record<string, unknown> | undefined
    if (!campaignLive(campaign)) continue
    const method = (row.application_method || {}) as Record<string, unknown>
    const target = String(method.target_type || "")
    if (target !== "items" && target !== "order") continue
    const type = method.type === "fixed" ? "fixed" : "percentage"
    const value = Number(method.value)
    if (!Number.isFinite(value) || value <= 0) continue
    const rules = (method.target_rules || []) as Array<{
      attribute?: string
      operator?: string
      values?: Array<{ value?: string } | string>
    }>
    const product_ids = ruleValues(rules, [
      "items.product.id",
      "product.id",
      "items.product_id",
    ])
    const collection_ids = ruleValues(rules, [
      "items.product.collection_id",
      "product.collection_id",
      "items.product.collection.id",
    ])
    const applies_to_all =
      target === "order" || (!product_ids.length && !collection_ids.length)
    sales.push({
      type,
      value: type === "percentage" && value > 100 ? 100 : value,
      product_ids,
      collection_ids,
      applies_to_all,
    })
  }
  return sales
}

export function discountedAmount(
  original: number,
  sale: CatalogSale
): number {
  if (sale.type === "percentage") {
    return original * (1 - sale.value / 100)
  }
  return original - sale.value
}
