<script setup>
import { computed, watch } from "vue"
import { useRouter } from "vue-router"
import ProductPhoto from "./ProductPhoto.vue"
import PromoField from "./PromoField.vue"
import {
  cartState,
  closeCart,
  itemCount,
  removeLine,
  setQty,
} from "../lib/cart.js"
import { formatPrice } from "../lib/sdk.js"
import { shopState } from "../lib/shop.js"

const router = useRouter()
const open = computed(() => cartState.open)

watch(open, (value) => {
  document.body.style.overflow = value ? "hidden" : ""
})

function money(item) {
  return formatPrice(
    item.unit_price ?? item.subtotal,
    cartState.cart?.currency_code || "rub"
  )
}

function goCheckout() {
  if (shopState.ordersClosed) return
  closeCart()
  router.push("/checkout")
}
</script>

<template>
  <div class="drawer-root" :style="{ pointerEvents: open ? 'auto' : 'none' }">
    <div
      v-show="open"
      class="scrim"
      @click="closeCart"
    />
    <aside
      class="drawer"
      :data-open="open ? 'true' : 'false'"
      role="dialog"
      aria-label="Корзина"
    >
      <div class="drawer-head">
        <span>Корзина</span>
        <button type="button" @click="closeCart">Закрыть</button>
      </div>
      <div class="drawer-body">
        <p v-if="!itemCount()" class="empty">Корзина пуста</p>
        <div v-for="item in cartState.cart?.items || []" :key="item.id" class="line">
          <div class="matte">
            <ProductPhoto :src="item.thumbnail || ''" :alt="item.title" />
          </div>
          <div>
            <div class="card-title">{{ item.title }}</div>
            <div class="card-meta">{{ money(item) }}</div>
            <div class="qty">
              <button type="button" @click="setQty(item.id, item.quantity - 1)">−</button>
              <span>{{ item.quantity }}</span>
              <button type="button" @click="setQty(item.id, item.quantity + 1)">+</button>
              <button type="button" @click="removeLine(item.id)">Удалить</button>
            </div>
          </div>
        </div>
        <p v-if="cartState.error" class="err">{{ cartState.error }}</p>
        <PromoField v-if="itemCount()" />
      </div>
      <div v-if="itemCount()" class="drawer-foot">
        <div>
          <span v-if="cartState.cart?.discount_total" class="price-was">
            {{ formatPrice(cartState.cart.item_subtotal ?? cartState.cart.subtotal, cartState.cart.currency_code || "rub") }}
          </span>
          Итого
          {{ formatPrice(cartState.cart?.total, cartState.cart?.currency_code || "rub") }}
        </div>
        <p v-if="shopState.ordersClosed" class="muted">{{ shopState.ordersMessage }}</p>
        <button
          class="btn"
          type="button"
          :disabled="shopState.ordersClosed"
          @click="goCheckout"
        >
          Оформить
        </button>
      </div>
    </aside>
  </div>
</template>
