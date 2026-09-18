type JsonRecord = Record<string, unknown>

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {}
}

export function slimDelegatFields(fields: unknown) {
  if (!Array.isArray(fields)) return []
  const rows: Array<{ key: string; name: string }> = []
  for (const field of fields) {
    const row = asRecord(field)
    const key = String(row.key ?? row.id ?? "").trim()
    const name = String(row.name ?? row.label ?? "").trim()
    if (!key && !name) continue
    rows.push({ key: key || name, name: name || key })
  }
  return rows
}

export function slimDelegatFieldsJson(fields: unknown) {
  return JSON.stringify(slimDelegatFields(fields))
}

export function stripStoreDelegatFields<T>(value: T): T {
  walkStrip(value, new WeakSet<object>())
  return value
}

function walkStrip(value: unknown, seen: WeakSet<object>) {
  if (!value || typeof value !== "object") return
  if (seen.has(value)) return
  seen.add(value)
  if (Array.isArray(value)) {
    for (const item of value) walkStrip(item, seen)
    return
  }
  const row = value as JsonRecord
  const metadata = row.metadata
  if (metadata && typeof metadata === "object" && !Array.isArray(metadata)) {
    delete (metadata as JsonRecord).delegat_fields
  }
  for (const nested of Object.values(row)) {
    walkStrip(nested, seen)
  }
}
