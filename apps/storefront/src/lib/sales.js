import { ref } from "vue"
import { BACKEND_URL, formatPrice, priceParts, storeHeaders } from "./sdk.js"

export const catalogSales = ref([])

export async function loadCatalogSales() {
  try {
    const res = await fetch(`${BACKEND_URL}/store/catalog-sales`, {
      headers: storeHeaders(),
    })
    if (!res.ok) return
    const data = await res.json()
    catalogSales.value = data.sales || []
  } catch {
    catalogSales.value = []
  }
}

function saleMatches(sale, product) {
  if (sale.applies_to_all) return true
  if (sale.product_ids?.includes(product?.id)) return true
  if (product?.collection_id && sale.collection_ids?.includes(product.collection_id)) {
    return true
  }
  return false
}

function applySaleValue(original, sale) {
  if (sale.type === "percentage") {
    return original * (1 - Number(sale.value) / 100)
  }
  return original - Number(sale.value)
}

export function productSalePrice(product) {
  return variantSalePrice(product?.variants?.[0], product)
}

export function variantSalePrice(variant, product) {
  const calc = variant?.calculated_price
  const base = priceParts(calc)
  if (base.onSale) return base
  const original = Number(calc?.calculated_amount ?? calc?.original_amount)
  if (!Number.isFinite(original) || original <= 0) return base
  const currency = calc?.currency_code || "rub"
  let best = original
  for (const sale of catalogSales.value) {
    if (!saleMatches(sale, product)) continue
    const next = applySaleValue(original, sale)
    if (next < best) best = next
  }
  if (best >= original || best < 0) return base
  return {
    current: formatPrice(best, currency),
    original: formatPrice(original, currency),
    onSale: true,
  }
}
