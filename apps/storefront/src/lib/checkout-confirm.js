function text(value) {
  return String(value || "").trim()
}

export function personName(first, last) {
  return [first, last].map(text).filter(Boolean).join(" ")
}

export function pvzLine(name, address) {
  const title = text(name)
  const place = text(address)
  if (title && place) return `${title}. ${place}`
  return title || place
}

export function checkoutConfirmFields(input = {}) {
  const fields = [
    { label: "Имя", value: personName(input.first_name, input.last_name) },
    { label: "Почта", value: text(input.email) },
    { label: "Телефон", value: text(input.phone) },
  ]
  const pvz = pvzLine(input.ozon_point_name, input.ozon_point_address)
  if (pvz) fields.push({ label: "Пункт выдачи", value: pvz })
  return fields.filter((field) => field.value)
}

export function customOrderConfirmFields(input = {}) {
  return [
    input.product ? { label: "Товар", value: text(input.product) } : null,
    { label: "Имя", value: text(input.name) },
    {
      label: text(input.channelLabel) || "Контакт",
      value: text(input.contact),
    },
    { label: "Что сделать", value: text(input.message) },
  ].filter((field) => field?.value)
}
