import { reactive } from "vue"
import { REGION_ID, sdk, shopError } from "./sdk.js"

const KEY = "shop_cart_id"
const COUNT_KEY = "shop_cart_count"

function readSavedCount() {
  try {
    const n = Number(
      localStorage.getItem(COUNT_KEY) || sessionStorage.getItem(COUNT_KEY) || 0
    )
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0
  } catch {
    return 0
  }
}

export const cartState = reactive({
  cart: null,
  count: readSavedCount(),
  priced: false,
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

function writeSavedCount(n) {
  const count = Number.isFinite(n) && n > 0 ? Math.floor(n) : 0
  cartState.count = count
  try {
    localStorage.setItem(COUNT_KEY, String(count))
    sessionStorage.setItem(COUNT_KEY, String(count))
  } catch {
    /* private mode */
  }
}

function countItems(cart) {
  return (
    cart?.items?.reduce((n, item) => n + (Number(item.quantity) || 0), 0) ?? 0
  )
}

function applyCart(cart, priced) {
  cartState.cart = cart
  cartState.priced = priced
  writeCartId(cart.id)
  writeSavedCount(countItems(cart))
}

const CART_BOOT_FIELDS =
  "id,email,currency_code,region_id,completed_at,metadata,items.id,items.title,items.thumbnail,items.quantity,items.variant_id,+items.product.handle,+items.variant.id,+items.variant.metadata,+items.variant.product.handle"

const CART_FIELDS =
  `${CART_BOOT_FIELDS},total,subtotal,discount_total,item_total,item_subtotal,original_item_total,original_item_subtotal,item_discount_total,shipping_total,shipping_subtotal,+items.total,+items.subtotal,+items.unit_price,+items.original_total,+items.original_subtotal,+items.compare_at_unit_price,*promotions,*shipping_methods`

export const CART_QUERY = { fields: CART_FIELDS }
const CART_BOOT_QUERY = { fields: CART_BOOT_FIELDS }

export async function retrieveCart(id, priced = true) {
  const { cart } = await sdk.store.cart.retrieve(
    id,
    priced ? CART_QUERY : CART_BOOT_QUERY
  )
  return cart
}

function forgetCartId() {
  try {
    localStorage.removeItem(KEY)
    sessionStorage.removeItem(KEY)
    localStorage.removeItem(COUNT_KEY)
    sessionStorage.removeItem(COUNT_KEY)
  } catch {
    /* private mode */
  }
  cartState.count = 0
  cartState.priced = false
}

function isMissingCart(error) {
  const status = Number(error?.status || error?.response?.status || 0)
  const text = String(error?.message || "")
  return status === 404 || /not found|does not exist/i.test(text)
}

export function openCart() {
  cartState.open = true
  if (!cartState.priced) void loadCart({ totals: true })
}

export function closeCart() {
  cartState.open = false
}

export async function loadCart(options = {}) {
  const totals = options.totals !== false
  const id = currentCartId()
  if (!id) {
    cartState.cart = null
    cartState.priced = false
    writeSavedCount(0)
    return
  }
  if (cartState.cart?.id === id && (cartState.priced || !totals)) return
  try {
    const cart = await retrieveCart(id, totals)
    applyCart(cart, totals)
  } catch (error) {
    if (isMissingCart(error)) {
      forgetCartId()
      cartState.cart = null
    }
  }
}

export function hydrateCartLater() {
  if (!currentCartId()) return
  window.setTimeout(() => {
    void loadCart({ totals: false })
  }, 6000)
}

async function ensureCart() {
  if (cartState.cart?.id && cartState.priced) return cartState.cart
  const existing = currentCartId()
  if (existing) {
    try {
      const cart = await retrieveCart(existing, true)
      applyCart(cart, true)
      return cart
    } catch (error) {
      if (isMissingCart(error)) forgetCartId()
      else if (cartState.cart?.id) return cartState.cart
    }
  }
  const { cart } = await sdk.store.cart.create(
    { region_id: REGION_ID },
    CART_QUERY
  )
  applyCart(cart, true)
  return cart
}

export async function addToCart(variantId, quantity = 1) {
  cartState.busy = true
  cartState.error = ""
  try {
    const cart = await ensureCart()
    const { cart: next } = await sdk.store.cart.createLineItem(
      cart.id,
      {
        variant_id: variantId,
        quantity,
      },
      CART_QUERY
    )
    applyCart(next, true)
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
      { quantity },
      CART_QUERY
    )
    applyCart(cart, true)
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
      lineId,
      CART_QUERY
    )
    applyCart(cart ?? (await retrieveCart(cartState.cart.id, true)), true)
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
  if (cartState.cart?.items) return countItems(cartState.cart)
  return cartState.count
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
    const { cart } = await sdk.store.cart.addPromotions(
      cartState.cart.id,
      {
        promo_codes: [promo],
      },
      CART_QUERY
    )
    applyCart(cart, true)
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
    const { cart } = await sdk.store.cart.removePromotions(
      cartState.cart.id,
      {
        promo_codes: [promo],
      },
      CART_QUERY
    )
    applyCart(cart, true)
  } catch (error) {
    cartState.error = shopError(error, "Не удалось убрать промокод")
  } finally {
    cartState.busy = false
  }
}
