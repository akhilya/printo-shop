<script setup>
import { computed, watch } from "vue"
import { useRouter } from "vue-router"
import LineProduct from "./LineProduct.vue"
import PromoField from "./PromoField.vue"
import {
  cartState,
  cartTotals,
  closeCart,
  itemCount,
  linePrices,
  removeLine,
  setQty,
} from "../lib/cart.js"
import { productHref } from "../lib/product-href.js"
import { formatPrice } from "../lib/sdk.js"
import { shopState } from "../lib/shop.js"

const router = useRouter()
const open = computed(() => cartState.open)
const totals = computed(() => cartTotals(cartState.cart))

watch(open, (value) => {
  document.body.style.overflow = value ? "hidden" : ""
})

function money(item) {
  const prices = linePrices(item)
  return {
    current: formatPrice(prices.current, cartState.cart?.currency_code || "rub"),
    original: formatPrice(prices.original, cartState.cart?.currency_code || "rub"),
    onSale: prices.onSale,
  }
}

function goCheckout() {
  if (shopState.ordersClosed) return
  closeCart()
  router.push("/checkout")
}

function onLineClick(item) {
  if (productHref(item)) closeCart()
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
          <LineProduct :item="item" @click="onLineClick(item)">
            <div>
              <div class="card-title">{{ item.title }}</div>
              <div class="card-meta">
                <span v-if="money(item).onSale" class="price-was">{{ money(item).original }}</span>
                {{ money(item).current }}
              </div>
            </div>
          </LineProduct>
          <div class="qty">
              <button type="button" @click="setQty(item.id, item.quantity - 1)">−</button>
              <span>{{ item.quantity }}</span>
              <button type="button" @click="setQty(item.id, item.quantity + 1)">+</button>
              <button type="button" @click="removeLine(item.id)">Удалить</button>
            </div>
        </div>
        <p v-if="cartState.error" class="err">{{ cartState.error }}</p>
        <PromoField v-if="itemCount()" />
      </div>
      <div v-if="itemCount()" class="drawer-foot">
        <div>
          <span v-if="totals.discount" class="price-was">
            {{ formatPrice(totals.items, cartState.cart.currency_code || "rub") }}
          </span>
          Итого
          {{ formatPrice(totals.total, cartState.cart?.currency_code || "rub") }}
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
