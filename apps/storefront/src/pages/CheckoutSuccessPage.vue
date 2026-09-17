<script setup>
import { computed, onMounted, ref } from "vue"
import { useRoute } from "vue-router"
import ProductPhoto from "../components/ProductPhoto.vue"
import { cartState, clearCartId, currentCartId, loadCart } from "../lib/cart.js"
import {
  isCartAlreadyCompletedError,
  isCompletedCart,
} from "../lib/checkout-success.js"
import { persistObject } from "../lib/persist.js"
import { BACKEND_URL, formatPrice, sdk, storeHeaders } from "../lib/sdk.js"

const route = useRoute()
const token = computed(() => String(route.params.token || ""))
const lastOrder = persistObject("shop_last_order", { id: "", email: "" })
const heading = ref("Проверяем оплату")
const message = ref("Если вы только что заплатили, статус придёт от банка.")
const order = ref(null)

function money(value) {
  if (value == null) return null
  if (typeof value === "number") return Number.isFinite(value) ? value : null
  if (typeof value === "object") return money(value.numeric ?? value.value)
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

function rememberOrder(id, email) {
  lastOrder.id = String(id || "")
  lastOrder.email = String(email || "")
}

function fromComplete(result) {
  const next = result?.order || null
  if (!next?.id) return null
  rememberOrder(next.id, next.email || "")
  return {
    order_id: next.id,
    display_id: next.display_id,
    email: next.email || null,
    total: money(next.total ?? next.summary?.current_order_total),
    currency_code: next.currency_code || "rub",
    shop_number: next.metadata?.shop_number || null,
    ozon_point_name:
      next.metadata?.ozon_point_name || next.shipping_address?.address_2 || "",
    ozon_point_address:
      next.metadata?.ozon_point_address ||
      next.shipping_address?.address_1 ||
      "",
    city: next.shipping_address?.city || "",
    items: (next.items || []).map((item) => ({
      title: item.title,
      quantity: item.quantity,
      sku: item.variant?.sku,
      thumbnail: item.thumbnail || null,
      unit_price: money(item.unit_price),
    })),
  }
}

function fromCustom(checkout) {
  if (!checkout) return null
  return {
    shop_number: checkout.shop_number,
    display_id: checkout.shop_number || checkout.title,
    email: checkout.email,
    total: checkout.amount,
    currency_code: checkout.currency || "rub",
    ozon_point_name: checkout.ozon_point_name,
    ozon_point_address: checkout.ozon_point_address,
    ozon_order_number: checkout.ozon_order_number,
    ozon_posting_number: checkout.ozon_posting_number,
    ozon_tracking: checkout.ozon_tracking,
    items: [
      {
        title: checkout.title,
        quantity: 1,
        thumbnail: checkout.product_thumbnail || checkout.image_urls?.[0] || "",
        unit_price: checkout.amount,
      },
    ],
  }
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

async function pollTracking(id, email) {
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      const data = await loadTracking(id, email)
      if (data) {
        order.value = {
          ...(order.value || {}),
          ...data,
        }
        if (
          data.ozon_order_number ||
          data.ozon_posting_number ||
          data.ozon_create_error
        ) {
          return
        }
      }
    } catch {
      // Ozon create runs after order.placed.
    }
    await new Promise((resolve) => setTimeout(resolve, 1500))
  }
}

async function pollCustom() {
  for (let attempt = 0; attempt < 8; attempt++) {
    const res = await fetch(
      `${BACKEND_URL}/store/custom-checkout/${encodeURIComponent(token.value)}/status`,
      { headers: storeHeaders() }
    )
    if (res.ok) {
      const data = await res.json()
      if (data.checkout?.paid) {
        order.value = fromCustom(data.checkout)
        heading.value = "Заказ оплачен"
        message.value = ""
        return true
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 1500))
  }
  return false
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

async function showPaid(next) {
  const id = next?.order_id || next?.id
  if (!id && !next?.shop_number) return false
  if (id) rememberOrder(id, next.email || "")
  clearCartId()
  order.value = next
  heading.value = "Заказ оплачен"
  message.value = ""
  if (id) await pollTracking(id, next.email || "")
  return true
}

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
    if (paidNow && (await showPaid(paidNow))) return
    if (!isCompletedCart(cartState.cart)) {
      for (let attempt = 0; attempt < 4; attempt++) {
        try {
          const result = await sdk.store.cart.complete(id)
          if (result.type === "order") {
            const next = fromComplete(result)
            if (await showPaid(next)) return
          }
          if (isCartAlreadyCompletedError(result.error || result)) break
        } catch (error) {
          if (isCartAlreadyCompletedError(error)) break
        }
        const paid = await loadPaidByCart(id)
        if (paid && (await showPaid(paid))) return
        await new Promise((resolve) => setTimeout(resolve, 1500))
      }
    }
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const paid = await loadPaidByCart(id)
        if (paid && (await showPaid(paid))) return
      } catch {
        // Webhook may still be writing the order.
      }
      await new Promise((resolve) => setTimeout(resolve, 1500))
    }
  }
  if (lastOrder.id && lastOrder.email) {
    try {
      const data = await loadTracking(lastOrder.id, lastOrder.email)
      if (data) {
        order.value = data
        heading.value = "Заказ оплачен"
        message.value = ""
        if (!data.ozon_order_number && !data.ozon_create_error) {
          await pollTracking(lastOrder.id, lastOrder.email)
        }
        return
      }
    } catch {
      // Fall through.
    }
  }
  if (!order.value) {
    heading.value = "Оплата не подтверждена"
    message.value =
      "Заказ не создан. Если вы уже заплатили, подождите минуту и обновите страницу. Если нет — вернитесь к оформлению."
  }
})
</script>

<template>
  <article class="checkout-done">
    <h1>{{ heading }}</h1>
    <p v-if="message">{{ message }}</p>
    <template v-if="order">
      <p class="checkout-done-id">
        Номер заказа {{ order.shop_number || order.display_id || order.order_id }}
      </p>
      <p v-if="order.shop_number">
        <router-link :to="`/order/${order.shop_number}`">Открыть заказ</router-link>
      </p>
      <p v-if="order.email" class="muted">
        Чек и ссылку на заказ отправим на {{ order.email }}
      </p>

      <section v-if="order.items?.length" class="checkout-done-block">
        <h2>Состав</h2>
        <div v-for="(item, index) in order.items" :key="index" class="line">
          <div class="matte">
            <ProductPhoto :src="item.thumbnail || ''" :alt="item.title" />
          </div>
          <div>
            <div class="card-title">{{ item.title }}</div>
            <p class="muted">
              {{ item.quantity }} шт.
              <template v-if="item.sku"> · {{ item.sku }}</template>
            </p>
          </div>
          <div v-if="item.unit_price != null" class="card-meta">
            {{ formatPrice(item.unit_price, order.currency_code || "rub") }}
          </div>
        </div>
        <p v-if="order.total != null" class="checkout-total">
          <span>Итого</span>
          <span>{{ formatPrice(order.total, order.currency_code || "rub") }}</span>
        </p>
      </section>

      <section
        v-if="order.ozon_point_name || order.ozon_point_address || order.ozon_tracking || !token"
        class="checkout-done-block"
      >
        <h2>Доставка Ozon</h2>
        <p v-if="order.ozon_point_name || order.ozon_point_address">
          ПВЗ: {{ order.ozon_point_name }}
          <template v-if="order.ozon_point_address">
            . {{ order.ozon_point_address }}
          </template>
        </p>
        <p v-if="order.city" class="muted">{{ order.city }}</p>
        <p v-if="order.ozon_order_number">
          Заказ в Ozon: {{ order.ozon_order_number }}
        </p>
        <p v-if="order.ozon_posting_number">
          Отправление: {{ order.ozon_posting_number }}
        </p>
        <p v-if="order.ozon_tracking">
          <a :href="order.ozon_tracking" target="_blank" rel="noreferrer">
            Отследить на Ozon
          </a>
        </p>
        <p v-else-if="order.ozon_create_error" class="muted">
          Заказ принят. Доставку Ozon подтвердим отдельно.
        </p>
        <p v-else-if="!token || order.ozon_point_name" class="muted">
          Отправление Ozon появится через минуту.
        </p>
      </section>
    </template>
  </article>
</template>
