export function isEmail(value) {
  const text = String(value || "").trim()
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)
}

export function isPhone(value) {
  let digits = String(value || "").replace(/\D/g, "")
  if (digits.length === 11 && digits.startsWith("8")) {
    digits = `7${digits.slice(1)}`
  }
  if (digits.length === 10) digits = `7${digits}`
  return digits.length >= 10 && digits.length <= 15
}

export function isShopNumber(value) {
  return /^\d{10}$/.test(String(value || "").replace(/\D/g, ""))
}

function extraValidity(field) {
  if (!(field instanceof HTMLElement) || !("validity" in field)) return ""
  const input = field
  const value = String(input.value || "").trim()
  if (input.type === "checkbox") {
    return input.required && !input.checked ? "Примите условия магазина" : ""
  }
  if (input.required && !value) {
    if (input.type === "email") return "Укажите почту"
    if (input.type === "tel") return "Укажите телефон"
    return "Заполните поле"
  }
  if (!value) return ""
  if (input.type === "email" && !isEmail(value)) return "Не похоже на почту"
  if (input.type === "tel" && !isPhone(value)) return "Телефон: 10–11 цифр"
  if (input.dataset.validate === "shop-number" && !isShopNumber(value)) {
    return "Номер заказа — 10 цифр"
  }
  const min = Number(input.minLength)
  if (min > 0 && value.length < min) return "Напишите подробнее"
  return ""
}

export function reportForm(form) {
  if (!form || typeof form.reportValidity !== "function") return true
  const fields = [...form.elements].filter(
    (el) => el instanceof HTMLElement && el.willValidate
  )
  for (const field of fields) {
    field.setCustomValidity("")
    const message = extraValidity(field)
    if (message) field.setCustomValidity(message)
  }
  if (form.reportValidity()) return true
  form.querySelector(":invalid")?.scrollIntoView({
    behavior: "smooth",
    block: "center",
  })
  return false
}
