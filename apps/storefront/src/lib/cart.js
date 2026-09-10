import { reactive } from "vue"
import { REGION_ID, sdk, shopError } from "./sdk.js"

const KEY = "shop_cart_id"

export const cartState = reactive({
  cart: null,
  open: false,
  busy: false,
  error: "",
})

export function openCart() {
  cartState.open = true
}

export function closeCart() {
  cartState.open = false
}

export async function loadCart() {
  const id = localStorage.getItem(KEY)
  if (!id) {
    cartState.cart = null
    return
  }
  try {
    const { cart } = await sdk.store.cart.retrieve(id)
    cartState.cart = cart
  } catch {
    localStorage.removeItem(KEY)
    cartState.cart = null
  }
}

async function ensureCart() {
  if (cartState.cart?.id) return cartState.cart
  const existing = localStorage.getItem(KEY)
  if (existing) {
    try {
      const { cart } = await sdk.store.cart.retrieve(existing)
      cartState.cart = cart
      return cart
    } catch {
      localStorage.removeItem(KEY)
    }
  }
  const { cart } = await sdk.store.cart.create({ region_id: REGION_ID })
  localStorage.setItem(KEY, cart.id)
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
  const { cart } = await sdk.store.cart.updateLineItem(cartState.cart.id, lineId, {
    quantity,
  })
  cartState.cart = cart
}

export async function removeLine(lineId) {
  if (!cartState.cart?.id) return
  const { parent: cart } = await sdk.store.cart.deleteLineItem(
    cartState.cart.id,
    lineId
  )
  cartState.cart = cart ?? (await sdk.store.cart.retrieve(cartState.cart.id)).cart
}

export function clearCartId() {
  localStorage.removeItem(KEY)
  cartState.cart = null
}

export function itemCount() {
  return cartState.cart?.items?.reduce((n, i) => n + i.quantity, 0) ?? 0
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
