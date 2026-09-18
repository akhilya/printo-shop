<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from "vue"
import { useRoute, useRouter } from "vue-router"
import { cartState, clearCartId, currentCartId, loadCart } from "../lib/cart.js"
import {
  isCartAlreadyCompletedError,
  isCompletedCart,
} from "../lib/checkout-success.js"
import { persistObject } from "../lib/persist.js"
import { BACKEND_URL, sdk, storeHeaders } from "../lib/sdk.js"

const route = useRoute()
const router = useRouter()
const token = computed(() => String(route.params.token || ""))
const lastOrder = persistObject("shop_last_order", { id: "", email: "" })
const heading = ref("Проверяем оплату")
const message = ref("Если вы только что заплатили, статус придёт от банка.")
let alive = true

function rememberOrder(id, email) {
  lastOrder.id = String(id || "")
  lastOrder.email = String(email || "")
}

function shopNumberOf(row) {
  const value = String(row?.shop_number || "").replace(/\D/g, "")
  return /^\d{10}$/.test(value) ? value : ""
}

async function goToOrder(row) {
  if (!alive) return true
  const number = shopNumberOf(row)
  const access = String(row?.access_token || "").trim()
  if (!number || !access) return false
  const id = row?.order_id || row?.id
  if (id) rememberOrder(id, row.email || "")
  clearCartId()
  await router.replace({
    path: `/order/${number}`,
    query: { paid: "1", t: access },
  })
  return true
}

async function loadPaidByCart(cartId) {
  if (!cartId) return null
  const res = await fetch(
    `${BACKEND_URL}/store/checkout-order?cart_id=${encodeURIComponent(cartId)}`,
    { headers: storeHeaders() }
  )
  if (!res.ok) return null
  return res.json()
}

async function loadTracking(id, email) {
  if (!id || !email) return null
  const res = await fetch(
    `${BACKEND_URL}/store/ozon/tracking?order_id=${encodeURIComponent(id)}&email=${encodeURIComponent(email)}`,
    { headers: storeHeaders() }
  )
  if (!res.ok) return null
  return res.json()
}

async function pollCustom() {
  for (let attempt = 0; attempt < 8; attempt++) {
    if (!alive) return true
    const res = await fetch(
      `${BACKEND_URL}/store/custom-checkout/${encodeURIComponent(token.value)}/status`,
      { headers: storeHeaders() }
    )
    if (res.ok) {
      const data = await res.json()
      if (data.checkout?.paid && (await goToOrder(data.checkout))) return true
    }
    await new Promise((resolve) => setTimeout(resolve, 1500))
  }
  return false
}

onBeforeUnmount(() => {
  alive = false
})

onMounted(async () => {
  if (token.value) {
    if (await pollCustom()) return
    heading.value = "Оплата не подтверждена"
    message.value =
      "Если вы уже заплатили, подождите минуту и обновите страницу."
    return
  }
  const storedId = currentCartId()
  await loadCart()
  const id = cartState.cart?.id || storedId
  if (id) {
    const paidNow = await loadPaidByCart(id)
    if (paidNow && (await goToOrder(paidNow))) return
    if (!isCompletedCart(cartState.cart)) {
      for (let attempt = 0; attempt < 4; attempt++) {
        if (!alive) return
        try {
          const result = await sdk.store.cart.complete(id)
          const next = result?.order
          if (result.type === "order" && next?.id) {
            rememberOrder(next.id, next.email || "")
            const number = shopNumberOf(next.metadata)
            if (number && (await goToOrder({ ...next, shop_number: number }))) {
              return
            }
            const paid = await loadPaidByCart(id)
            if (paid && (await goToOrder(paid))) return
          }
          if (isCartAlreadyCompletedError(result.error || result)) break
        } catch (error) {
          if (isCartAlreadyCompletedError(error)) break
        }
        const paid = await loadPaidByCart(id)
        if (paid && (await goToOrder(paid))) return
        await new Promise((resolve) => setTimeout(resolve, 1500))
      }
    }
    for (let attempt = 0; attempt < 4; attempt++) {
      if (!alive) return
      const paid = await loadPaidByCart(id)
      if (paid && (await goToOrder(paid))) return
      await new Promise((resolve) => setTimeout(resolve, 1500))
    }
  }
  if (lastOrder.id && lastOrder.email) {
    try {
      const data = await loadTracking(lastOrder.id, lastOrder.email)
      if (data && (await goToOrder(data))) return
    } catch {
      // Fall through.
    }
  }
  heading.value = "Оплата не подтверждена"
  message.value =
    "Заказ не создан. Если вы уже заплатили, подождите минуту и обновите страницу. Если нет — вернитесь к оформлению."
})
</script>

<template>
  <article class="checkout-done">
    <h1>{{ heading }}</h1>
    <p v-if="message">{{ message }}</p>
    <p v-if="heading === 'Оплата не подтверждена'">
      <router-link to="/order">Найти заказ</router-link>
    </p>
  </article>
</template>
