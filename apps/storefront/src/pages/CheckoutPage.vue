<script setup>
import { onMounted, ref } from "vue"
import ProductPhoto from "../components/ProductPhoto.vue"
import PromoField from "../components/PromoField.vue"
import { cartState, loadCart, removeLine, setQty } from "../lib/cart.js"
import { persistObject } from "../lib/persist.js"
import { formatPrice, sdk, shopError } from "../lib/sdk.js"
import { shopState } from "../lib/shop.js"

const busy = ref(false)
const error = ref("")
const form = persistObject("shop_checkout", {
  email: "",
  first_name: "",
  last_name: "",
  phone: "",
  address_1: "",
  city: "",
  postal_code: "",
})

onMounted(loadCart)

async function submit(event) {
  event.preventDefault()
  if (shopState.ordersClosed) {
    error.value = shopState.ordersMessage
    return
  }
  if (!cartState.cart?.id) {
    error.value = "Корзина пуста"
    return
  }
  busy.value = true
  error.value = ""
  try {
    const address = {
      first_name: form.first_name,
      last_name: form.last_name,
      phone: form.phone,
      address_1: form.address_1,
      city: form.city,
      postal_code: form.postal_code,
      country_code: "ru",
    }
    let { cart } = await sdk.store.cart.update(cartState.cart.id, {
      email: form.email,
      shipping_address: address,
      billing_address: address,
    })

    const options = await sdk.store.fulfillment.listCartOptions({
      cart_id: cart.id,
    })
    const shipping = options.shipping_options?.[0]
    if (shipping) {
      const added = await sdk.store.cart.addShippingMethod(cart.id, {
        option_id: shipping.id,
      })
      cart = added.cart
    }

    const { payment_collection } = await sdk.store.payment.initiatePaymentSession(
      cart,
      {
        provider_id: "pp_tbank_tbank",
        data: { cart_id: cart.id },
      }
    )
    const sessions = payment_collection?.payment_sessions || []
    const session =
      sessions.find((item) => item.provider_id === "pp_tbank_tbank") ||
      sessions[0]
    const payUrl = session?.data?.PaymentURL
    if (payUrl) {
      window.location.href = String(payUrl)
      return
    }
    error.value = "Не удалось создать платёж. Попробуйте ещё раз."
  } catch (e) {
    error.value = shopError(e, "Не удалось оформить заказ")
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="checkout">
    <h1 class="product-title">Оформление</h1>
    <p v-if="!cartState.cart?.items?.length" class="empty">Корзина пуста</p>
    <div v-else class="checkout-layout">
      <div class="checkout-items">
        <h2>Заказ</h2>
        <div
          v-for="item in cartState.cart.items"
          :key="item.id"
          class="line"
        >
          <div class="matte">
            <ProductPhoto :src="item.thumbnail || ''" :alt="item.title" />
          </div>
          <div>
            <div class="card-title">{{ item.title }}</div>
            <p
              v-if="item.variant?.title && item.variant.title !== 'Default'"
              class="muted"
            >
              {{ item.variant.title }}
            </p>
            <div class="card-meta">
              {{ formatPrice(item.unit_price ?? item.subtotal, cartState.cart.currency_code || "rub") }}
            </div>
            <div class="qty">
              <button
                type="button"
                :disabled="cartState.busy"
                @click="setQty(item.id, item.quantity - 1)"
              >
                −
              </button>
              <span>{{ item.quantity }}</span>
              <button
                type="button"
                :disabled="cartState.busy"
                @click="setQty(item.id, item.quantity + 1)"
              >
                +
              </button>
              <button
                type="button"
                :disabled="cartState.busy"
                @click="removeLine(item.id)"
              >
                Удалить
              </button>
            </div>
          </div>
        </div>
        <p v-if="cartState.error" class="err">{{ cartState.error }}</p>
        <PromoField />
        <div class="totals">
          <div>
            <span>Товары</span>
            <span>{{ formatPrice(cartState.cart.item_subtotal ?? cartState.cart.subtotal, cartState.cart.currency_code || "rub") }}</span>
          </div>
          <div v-if="cartState.cart.discount_total">
            <span>Скидка</span>
            <span>−{{ formatPrice(cartState.cart.discount_total, cartState.cart.currency_code || "rub") }}</span>
          </div>
          <div class="checkout-total">
            <span>Итого</span>
            <span>{{ formatPrice(cartState.cart.total, cartState.cart.currency_code || "rub") }}</span>
          </div>
        </div>
      </div>
      <form class="form" @submit="submit">
        <label>Email <input v-model="form.email" type="email" required /></label>
        <label>Имя <input v-model="form.first_name" required /></label>
        <label>Фамилия <input v-model="form.last_name" required /></label>
        <label>Телефон <input v-model="form.phone" type="tel" required /></label>
        <label>Адрес <input v-model="form.address_1" required /></label>
        <label>Город <input v-model="form.city" required /></label>
        <label>Индекс <input v-model="form.postal_code" required /></label>
        <p v-if="shopState.ordersClosed" class="muted">{{ shopState.ordersMessage }}</p>
        <p v-if="error" class="err">{{ error }}</p>
        <button
          class="btn"
          type="submit"
          :disabled="busy || cartState.busy || shopState.ordersClosed"
        >
          Оплатить
        </button>
      </form>
    </div>
  </div>
</template>
