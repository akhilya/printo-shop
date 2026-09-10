<script setup>
import { computed, ref } from "vue"
import { applyPromo, cartState, removePromo } from "../lib/cart.js"

const code = ref("")
const codes = computed(() =>
  (cartState.cart?.promotions || []).filter((promo) => !promo.is_automatic)
)

async function onApply(event) {
  event.preventDefault()
  await applyPromo(code.value)
  if (!cartState.error) code.value = ""
}
</script>

<template>
  <div class="promo-block">
    <form class="promo" @submit="onApply">
      <label>
        Промокод
        <input
          v-model="code"
          type="text"
          maxlength="40"
          autocomplete="off"
          :disabled="cartState.busy"
        />
      </label>
      <button
        class="btn"
        type="submit"
        :disabled="cartState.busy || !code.trim()"
      >
        Применить
      </button>
    </form>
    <ul v-if="codes.length" class="promo-list">
      <li v-for="promo in codes" :key="promo.id || promo.code">
        <span>{{ promo.code }}</span>
        <button
          type="button"
          class="btn-ghost"
          :disabled="cartState.busy"
          @click="removePromo(promo.code)"
        >
          Убрать
        </button>
      </li>
    </ul>
  </div>
</template>
