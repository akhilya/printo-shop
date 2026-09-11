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
  const currency = calc?.currency_code || "rub"
  const current = Number(calc?.calculated_amount ?? calc?.original_amount)
  if (!Number.isFinite(current) || current < 0) return priceParts(calc)
  const promoOriginal = Number(calc?.original_amount)
  const listedOld = Number(
    variant?.metadata?.old_price ?? product?.metadata?.old_price
  )
  let strike = 0
  if (Number.isFinite(listedOld) && listedOld > current) strike = listedOld
  if (
    Number.isFinite(promoOriginal) &&
    promoOriginal > current &&
    promoOriginal > strike
  ) {
    strike = promoOriginal
  }
  let best = current
  for (const sale of catalogSales.value) {
    if (!saleMatches(sale, product)) continue
    const next = applySaleValue(current, sale)
    if (next < best) best = next
  }
  const onSale = strike > best && best >= 0
  return {
    current: formatPrice(best, currency),
    original: onSale ? formatPrice(strike, currency) : "",
    onSale,
  }
}
