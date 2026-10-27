<script setup>
import { onMounted, ref } from "vue"
import { useRouter } from "vue-router"
import { bindPageBusy } from "../lib/page-busy.js"
import { BACKEND_URL, formatPrice, shopError, storeHeaders } from "../lib/sdk.js"

const router = useRouter()
const denominations = ref([])
const amount = ref(null)
const email = ref("")
const error = ref("")
const loading = ref(true)
const submitting = ref(false)
bindPageBusy(loading)

onMounted(async () => {
  try {
    const res = await fetch(`${BACKEND_URL}/store/gift-cards`, {
      headers: storeHeaders(),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error("load_failed")
    denominations.value = Array.isArray(data.denominations)
      ? data.denominations
      : []
    amount.value = denominations.value[0] || null
  } catch {
    error.value = "Не удалось загрузить сертификаты. Попробуйте позже."
  } finally {
    loading.value = false
  }
})

async function submit(event) {
  event.preventDefault()
  if (submitting.value || !amount.value) return
  submitting.value = true
  error.value = ""
  try {
    const res = await fetch(`${BACKEND_URL}/store/gift-cards`, {
      method: "POST",
      headers: { ...storeHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ amount: amount.value, email: email.value }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || !data.token) throw new Error(data.message || "create_failed")
    await router.push(`/custom-order/pay/${encodeURIComponent(data.token)}`)
  } catch (cause) {
    error.value = shopError(cause, "Не удалось оформить сертификат")
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <article class="page narrow-page">
    <h1>Подарочный сертификат</h1>
    <p class="muted">
      Выберите номинал. После оплаты мы отправим код на указанную почту — его
      можно применить один раз при оформлении заказа.
    </p>
    <p v-if="!loading && !denominations.length" class="muted">
      Сертификаты временно недоступны.
    </p>
    <form v-else class="form" @submit="submit">
      <label>
        Номинал
        <select v-model.number="amount" required>
          <option v-for="value in denominations" :key="value" :value="value">
            {{ formatPrice(value, "rub") }}
          </option>
        </select>
      </label>
      <label>
        Почта для получения сертификата
        <input
          v-model.trim="email"
          type="email"
          autocomplete="email"
          maxlength="254"
          required
        />
      </label>
      <p v-if="error" class="err">{{ error }}</p>
      <button class="btn" type="submit" :disabled="submitting || !amount">
        {{ submitting ? "Переходим к оплате…" : "Продолжить к оплате" }}
      </button>
    </form>
  </article>
</template>
