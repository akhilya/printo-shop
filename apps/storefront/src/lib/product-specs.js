const SPEC_LABELS = {
  материал: "Материал",
  "высота предмета": "Высота",
  "высота фигурки (мм)": "Высота фигурки",
  "высота фигурки": "Высота фигурки",
  "ширина предмета": "Ширина",
  глубина: "Глубина",
  целостность: "Целостность",
  "количество фигурок": "Фигурок",
  "количество предметов в упаковке": "В упаковке",
  "цвет товара": "Цвет",
  цвет: "Цвет",
  бренд: "Бренд",
  "страна-изготовитель": "Страна",
  "страна производства": "Страна",
  "возрастные ограничения": "Возраст",
  "вес с упаковкой, г": "Вес",
  вес: "Вес",
  "weight (g)": "Вес",
  "вид упаковки": "Упаковка",
  коллекционные: "Коллекционные",
  "размер упаковки (длина х ширина х высота), см": "Упаковка, см",
  test_field: "Test field",
}

const SPEC_ORDER = [
  "Материал",
  "Высота фигурки",
  "Высота",
  "Ширина",
  "Глубина",
  "Фигурок",
  "В упаковке",
  "Цвет",
  "Бренд",
  "Страна",
  "Возраст",
  "Вес",
  "Целостность",
  "Упаковка",
  "Упаковка, см",
  "Коллекционные",
]

export function parseAttributes(raw) {
  if (!raw) return {}
  if (Array.isArray(raw)) return {}
  if (typeof raw === "object") return raw
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : {}
  } catch {
    return {}
  }
}

export function formatSpecValue(value) {
  if (value == null) return ""
  if (typeof value === "object") {
    if (Array.isArray(value)) {
      return value.map(formatSpecValue).filter(Boolean).join(", ")
    }
    if (value.label != null || value.value != null || value.name != null) {
      return formatSpecValue(value.label ?? value.value ?? value.name)
    }
    return ""
  }
  const text = String(value).trim()
  if (!text) return ""
  const lower = text.toLowerCase()
  if (lower === "false") return "Нет"
  if (lower === "true" || lower === "да") return "Да"
  return text
}

export function humanizeSpecKey(key) {
  const spaced = String(key || "").replace(/[_-]+/g, " ").trim()
  if (!spaced) return key
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

export function specLabel(key) {
  return SPEC_LABELS[String(key || "").trim().toLowerCase()] || humanizeSpecKey(key)
}

export function withSpecUnit(key, label, value) {
  if (!/^\d+([.,]\d+)?$/.test(value)) return value
  const blob = `${key} ${label}`.toLowerCase()
  if (/мм|\bmm\b/.test(blob)) return `${value} мм`
  if (label === "Вес" || /\bвес\b|weight/.test(blob)) return `${value} г`
  return value
}

function parseShopSpecs(raw) {
  if (Array.isArray(raw)) return raw
  const parsed = parseAttributes(raw)
  if (Array.isArray(parsed)) return parsed
  try {
    const json = typeof raw === "string" ? JSON.parse(raw) : null
    return Array.isArray(json) ? json : null
  } catch {
    return null
  }
}

function withSku(rows, product) {
  const sku = product?.variants?.[0]?.sku
  if (!sku) return rows
  if (rows.some((row) => row.label === "Артикул" || row.key === "sku")) return rows
  return [...rows, { key: "sku", label: "Артикул", value: String(sku) }]
}

export function productSpecs(product) {
  const explicit = parseShopSpecs(product?.metadata?.specs)
  const attrs = parseAttributes(product?.metadata?.attributes)
  const seen = new Set()
  const fromSpecs = []

  if (Array.isArray(explicit)) {
    for (const item of explicit) {
      const key = String(item?.key || item?.label || "").trim()
      const label = specLabel(item?.label || key)
      const value = formatSpecValue(item?.value)
      if (!key && !label) continue
      if (!value) continue
      seen.add(label.toLowerCase())
      seen.add(key.toLowerCase())
      fromSpecs.push({ key: key || label, label, value: withSpecUnit(key, label, value) })
    }
  }

  const fromAttrs = new Map()
  const brand = String(product?.metadata?.brand || "").trim()
  if (brand) {
    fromAttrs.set("Бренд", { key: "brand", label: "Бренд", value: brand })
    seen.add("бренд")
    seen.add("brand")
  }

  for (const [rawKey, rawValue] of Object.entries(attrs)) {
    const key = String(rawKey || "").trim()
    if (!key) continue
    const label = specLabel(key)
    let value = formatSpecValue(rawValue)
    if (!value) continue
    if (seen.has(label.toLowerCase()) || seen.has(key.toLowerCase())) continue
    value = withSpecUnit(key, label, value)
    seen.add(label.toLowerCase())
    seen.add(key.toLowerCase())
    fromAttrs.set(label, { key, label, value })
  }

  const ordered = [...fromSpecs]
  for (const label of SPEC_ORDER) {
    const row = fromAttrs.get(label)
    if (row) {
      ordered.push(row)
      fromAttrs.delete(label)
    }
  }
  for (const row of fromAttrs.values()) {
    ordered.push(row)
  }
  return withSku(ordered, product)
}
