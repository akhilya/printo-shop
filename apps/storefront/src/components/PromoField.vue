<script setup>
import { computed, ref } from "vue"
import { applyPromo, cartState, removePromo } from "../lib/cart.js"
import { BACKEND_URL, shopError, storeHeaders } from "../lib/sdk.js"

const props = defineProps({
  token: { type: String, default: "" },
  promoCode: { type: String, default: "" },
})

const emit = defineEmits(["applied"])

const code = ref("")
const localError = ref("")
const localBusy = ref(false)
const codes = computed(() => {
  if (props.token) {
    return props.promoCode ? [{ code: props.promoCode }] : []
  }
  return (cartState.cart?.promotions || []).filter(
    (promo) => promo && !promo.is_automatic && promo.code
  )
})

async function onApply(event) {
  event?.preventDefault?.()
  const promo = code.value.trim()
  if (!promo) {
    localError.value = "Введите промокод"
    return
  }
  localError.value = ""
  if (props.token) {
    localBusy.value = true
    localError.value = ""
    try {
      const res = await fetch(
        `${BACKEND_URL}/store/custom-checkout/${encodeURIComponent(props.token)}/promo`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...storeHeaders(),
          },
          body: JSON.stringify({ code: promo }),
        }
      )
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.message || "promo_failed")
      code.value = ""
      emit("applied", data.checkout)
    } catch (error) {
      localError.value = shopError(error, "Промокод не применился")
    } finally {
      localBusy.value = false
    }
    return
  }
  await applyPromo(promo)
  if (!cartState.error) code.value = ""
}

async function onRemove(value) {
  if (props.token) {
    localBusy.value = true
    localError.value = ""
    try {
      const res = await fetch(
        `${BACKEND_URL}/store/custom-checkout/${encodeURIComponent(props.token)}/promo`,
        {
          method: "DELETE",
          headers: storeHeaders(),
        }
      )
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.message || "promo_failed")
      emit("applied", data.checkout)
    } catch (error) {
      localError.value = shopError(error, "Не удалось убрать промокод")
    } finally {
      localBusy.value = false
    }
    return
  }
  await removePromo(value)
}
</script>

<template>
  <div class="promo-block">
    <div class="promo">
      <label>
        Промокод
        <input
          v-model="code"
          type="text"
          maxlength="40"
          autocomplete="off"
          :disabled="cartState.busy || localBusy"
          @keydown.enter.prevent="onApply"
        />
      </label>
      <button
        class="btn"
        type="button"
        :disabled="cartState.busy || localBusy || !code.trim()"
        @click="onApply"
      >
        Применить
      </button>
    </div>
    <ul v-if="codes.length" class="promo-list">
      <li v-for="promo in codes" :key="promo.id || promo.code">
        <span>{{ promo.code }}</span>
        <button
          type="button"
          class="btn-ghost"
          :disabled="cartState.busy || localBusy"
          @click="onRemove(promo.code)"
        >
          Убрать
        </button>
      </li>
    </ul>
    <p v-if="localError" class="err">{{ localError }}</p>
  </div>
</template>
