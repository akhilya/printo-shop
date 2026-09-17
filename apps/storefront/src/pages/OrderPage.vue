<script setup>
import { computed, onMounted, ref, watch } from "vue"
import { useRoute, useRouter } from "vue-router"
import ProductPhoto from "../components/ProductPhoto.vue"
import { BACKEND_URL, formatPrice, storeHeaders } from "../lib/sdk.js"
import { reportForm } from "../lib/form-valid.js"

const route = useRoute()
const router = useRouter()
const numberParam = computed(() => String(route.params.number || "").trim())
const query = ref(numberParam.value)
const order = ref(null)
const loading = ref(false)
const error = ref("")
const writeEmail = ref("")
const writeMessage = ref("")
const writeBusy = ref(false)
const writeError = ref("")
const writeDone = ref(false)
const canWrite = computed(() => order.value?.can_message !== false)

async function load(number) {
  const value = String(number || "").replace(/\D/g, "")
  if (!/^\d{10}$/.test(value)) {
    order.value = null
    error.value = value ? "Номер заказа — 10 цифр." : ""
    return
  }
  loading.value = true
  error.value = ""
  try {
    const res = await fetch(
      `${BACKEND_URL}/store/shop-orders/${encodeURIComponent(value)}`,
      { headers: storeHeaders() }
    )
    if (!res.ok) {
      order.value = null
      error.value = "Заказ не найден."
      return
    }
    const data = await res.json()
    order.value = data.order
    writeEmail.value = ""
    writeMessage.value = ""
    writeError.value = ""
    writeDone.value = false
  } catch {
    order.value = null
    error.value = "Не удалось загрузить заказ."
  } finally {
    loading.value = false
  }
}

async function onWrite(event) {
  event.preventDefault()
  if (!order.value?.number || writeBusy.value) return
  if (!reportForm(event.currentTarget)) return
  writeBusy.value = true
  writeError.value = ""
  try {
    const res = await fetch(
      `${BACKEND_URL}/store/shop-orders/${encodeURIComponent(order.value.number)}/message`,
      {
        method: "POST",
        headers: { ...storeHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          email: writeEmail.value,
          message: writeMessage.value,
        }),
      }
    )
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      writeError.value = data.message || "Не удалось отправить."
      return
    }
    writeDone.value = true
    writeMessage.value = ""
  } catch {
    writeError.value = "Не удалось отправить."
  } finally {
    writeBusy.value = false
  }
}

function onLookup(event) {
  event.preventDefault()
  if (!reportForm(event.currentTarget)) return
  const value = query.value.replace(/\D/g, "")
  if (value === numberParam.value) {
    load(value)
    return
  }
  router.push(value ? `/order/${value}` : "/order")
}

onMounted(() => load(numberParam.value))
watch(numberParam, (value) => {
  query.value = value
  load(value)
})
</script>

<template>
  <article class="checkout-done">
    <h1>{{ order ? `Заказ ${order.number}` : "Заказ" }}</h1>
    <form class="order-lookup" @submit="onLookup">
      <label>
        Номер заказа
        <input
          v-model="query"
          inputmode="numeric"
          maxlength="10"
          placeholder="10 цифр"
          autocomplete="off"
          required
          data-validate="shop-number"
        />
      </label>
      <button class="btn" type="submit">Найти</button>
    </form>
    <p v-if="loading" class="muted">Загрузка</p>
    <p v-else-if="error" class="err">{{ error }}</p>
    <template v-else-if="order">
      <p class="checkout-done-id">{{ order.status?.label }}</p>
      <p v-if="order.cancel_reason" class="muted">{{ order.cancel_reason }}</p>
      <p v-if="order.cancel_note" class="muted" style="white-space: pre-wrap">
        {{ order.cancel_note }}
      </p>
      <p v-if="order.email" class="muted">{{ order.email }}</p>
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
        <p v-if="order.details" class="muted" style="white-space: pre-wrap">
          {{ order.details }}
        </p>
        <p v-if="order.total != null" class="checkout-total">
          <span>Итого</span>
          <span>{{ formatPrice(order.total, order.currency_code || "rub") }}</span>
        </p>
      </section>
      <section
        v-if="order.ozon_point_name || order.ozon_point_address || order.ozon_tracking"
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
      </section>
      <section v-if="canWrite" class="checkout-done-block">
        <h2>Написать о заказе</h2>
        <p class="muted">
          Вернуть товар одной кнопкой нельзя.
          Если брак или ошибка — напишите. Разберём по почте.
          <router-link to="/returns">Правила возврата</router-link>
        </p>
        <p v-if="writeDone" class="muted">Письмо получили. Ответим на эту почту.</p>
        <form v-else class="form" @submit="onWrite">
          <label>
            Почта с оформления
            <input
              v-model="writeEmail"
              type="email"
              required
              autocomplete="email"
            />
          </label>
          <label>
            Что случилось
            <textarea
              v-model="writeMessage"
              rows="4"
              required
              minlength="10"
              maxlength="4000"
            />
          </label>
          <p v-if="writeError" class="err">{{ writeError }}</p>
          <button class="btn" type="submit" :disabled="writeBusy">
            {{ writeBusy ? "Отправка" : "Отправить" }}
          </button>
        </form>
      </section>
    </template>
  </article>
</template>
