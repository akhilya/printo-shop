import { reactive } from "vue"
import { REGION_ID, sdk, shopError } from "./sdk.js"

const KEY = "shop_cart_id"

export const cartState = reactive({
  cart: null,
  open: false,
  busy: false,
  error: "",
})

export function currentCartId() {
  try {
    return localStorage.getItem(KEY) || sessionStorage.getItem(KEY) || ""
  } catch {
    return ""
  }
}

function writeCartId(id) {
  try {
    localStorage.setItem(KEY, id)
    sessionStorage.setItem(KEY, id)
  } catch {
    /* private mode */
  }
}

const CART_FIELDS =
  "*items,*items.variant,+items.variant.metadata,*items.variant.product,+items.variant.product.handle,+items.product.handle,*promotions,*shipping_methods"

async function retrieveCart(id) {
  const { cart } = await sdk.store.cart.retrieve(id, { fields: CART_FIELDS })
  return cart
}

function forgetCartId() {
  try {
    localStorage.removeItem(KEY)
    sessionStorage.removeItem(KEY)
  } catch {
    /* private mode */
  }
}

function isMissingCart(error) {
  const status = Number(error?.status || error?.response?.status || 0)
  const text = String(error?.message || "")
  return status === 404 || /not found|does not exist/i.test(text)
}

export function openCart() {
  cartState.open = true
}

export function closeCart() {
  cartState.open = false
}

export async function loadCart() {
  const id = currentCartId()
  if (!id) {
    cartState.cart = null
    return
  }
  try {
    const cart = await retrieveCart(id)
    cartState.cart = cart
    writeCartId(cart.id)
  } catch (error) {
    if (isMissingCart(error)) {
      forgetCartId()
      cartState.cart = null
    }
  }
}

async function ensureCart() {
  if (cartState.cart?.id) return cartState.cart
  const existing = currentCartId()
  if (existing) {
    try {
      const cart = await retrieveCart(existing)
      cartState.cart = cart
      writeCartId(cart.id)
      return cart
    } catch (error) {
      if (isMissingCart(error)) forgetCartId()
      else if (cartState.cart?.id) return cartState.cart
    }
  }
  const { cart } = await sdk.store.cart.create({ region_id: REGION_ID })
  writeCartId(cart.id)
  cartState.cart = cart
  return cart
}

export async function addToCart(variantId, quantity = 1) {
  cartState.busy = true
  cartState.error = ""
  try {
    const cart = await ensureCart()
    const { cart: next } = await sdk.store.cart.createLineItem(cart.id, {
      variant_id: variantId,
      quantity,
    })
    cartState.cart = next
    openCart()
  } catch (error) {
    cartState.error = shopError(error, "Не удалось добавить товар")
  } finally {
    cartState.busy = false
  }
}

export async function setQty(lineId, quantity) {
  if (!cartState.cart?.id) return
  if (quantity < 1) {
    await removeLine(lineId)
    return
  }
  cartState.busy = true
  cartState.error = ""
  try {
    const { cart } = await sdk.store.cart.updateLineItem(
      cartState.cart.id,
      lineId,
      { quantity }
    )
    cartState.cart = cart
  } catch (error) {
    cartState.error = shopError(error, "Не удалось изменить количество")
  } finally {
    cartState.busy = false
  }
}

export async function removeLine(lineId) {
  if (!cartState.cart?.id) return
  cartState.busy = true
  cartState.error = ""
  try {
    const { parent: cart } = await sdk.store.cart.deleteLineItem(
      cartState.cart.id,
      lineId
    )
    cartState.cart = cart ?? (await retrieveCart(cartState.cart.id))
  } catch (error) {
    cartState.error = shopError(error, "Не удалось удалить товар")
  } finally {
    cartState.busy = false
  }
}

export function clearCartId() {
  forgetCartId()
  cartState.cart = null
}

if (import.meta.hot) {
  import.meta.hot.accept(() => {
    loadCart()
  })
}

export function itemCount() {
  return cartState.cart?.items?.reduce((n, i) => n + i.quantity, 0) ?? 0
}

export function cartMoney(value) {
  if (value == null || value === "") return 0
  if (typeof value === "number") return Number.isFinite(value) ? value : 0
  if (typeof value === "object") {
    return cartMoney(value.numeric ?? value.value ?? value.amount)
  }
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : 0
}

export function linePrices(item) {
  const qty = Number(item?.quantity || 1)
  const current = cartMoney(
    item?.total ?? item?.subtotal ?? item?.unit_price
  )
  const listedOld =
    cartMoney(item?.variant?.metadata?.old_price) * qty ||
    cartMoney(item?.compare_at_unit_price) * qty
  const original = Math.max(
    cartMoney(item?.original_total ?? item?.original_subtotal),
    listedOld
  )
  const onSale = original > current && current >= 0
  return {
    current,
    original: onSale ? original : current,
    onSale,
  }
}

export function cartTotals(cart) {
  if (!cart) {
    return { items: 0, discount: 0, shipping: 0, total: 0 }
  }
  const total = cartMoney(cart.total)
  const methods = Array.isArray(cart.shipping_methods)
    ? cart.shipping_methods
    : []
  const methodShipping = methods.reduce(
    (sum, method) => sum + cartMoney(method?.amount),
    0
  )
  let shipping = cartMoney(cart.shipping_total ?? cart.shipping_subtotal)
  if (!shipping) shipping = methodShipping
  if (!shipping) shipping = cartMoney(cart.metadata?.ozon_shipping_amount)
  const discount = cartMoney(cart.discount_total)
  const originalItems = cartMoney(
    cart.original_item_total ?? cart.original_item_subtotal
  )
  const itemTotal = cartMoney(cart.item_total ?? cart.item_subtotal)
  const itemDiscount = cartMoney(cart.item_discount_total)
  const items =
    originalItems ||
    (itemTotal + itemDiscount) ||
    cartMoney(cart.subtotal) ||
    total - shipping + discount
  return {
    items,
    discount,
    shipping,
    total,
  }
}

export async function applyPromo(code) {
  const promo = String(code || "").trim()
  if (!promo || !cartState.cart?.id) return
  cartState.busy = true
  cartState.error = ""
  try {
    const { cart } = await sdk.store.cart.addPromotions(cartState.cart.id, {
      promo_codes: [promo],
    })
    cartState.cart = cart
  } catch (error) {
    const raw = String(error.message || "")
    cartState.error = /invalid|not found/i.test(raw)
      ? "Такого промокода нет"
      : shopError(error, "Промокод не применился")
  } finally {
    cartState.busy = false
  }
}

export async function removePromo(code) {
  const promo = String(code || "").trim()
  if (!promo || !cartState.cart?.id) return
  cartState.busy = true
  cartState.error = ""
  try {
    const { cart } = await sdk.store.cart.removePromotions(cartState.cart.id, {
      promo_codes: [promo],
    })
    cartState.cart = cart
  } catch (error) {
    cartState.error = shopError(error, "Не удалось убрать промокод")
  } finally {
    cartState.busy = false
  }
}
