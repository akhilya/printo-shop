<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue"
import { useRoute, useRouter } from "vue-router"
import LineProduct from "../components/LineProduct.vue"
import { BACKEND_URL, formatPrice, storeHeaders } from "../lib/sdk.js"
import { reportForm } from "../lib/form-valid.js"

const route = useRoute()
const router = useRouter()
const numberParam = computed(() => String(route.params.number || "").trim())
const justPaid = computed(() => String(route.query.paid || "") === "1")
const access = computed(() =>
  String(route.query.t || route.query.token || "").trim()
)
const query = ref(numberParam.value)
const order = ref(null)
const loading = ref(false)
const error = ref("")
const writeEmail = ref("")
const writeMessage = ref("")
const writeBusy = ref(false)
const writeError = ref("")
const writeDone = ref(false)
let alive = true
const canWrite = computed(() => order.value?.can_message === true)
const heading = computed(() => {
  if (justPaid.value && order.value) return "Заказ оплачен"
  const number = order.value?.number || numberParam.value
  if (number) return `Заказ ${number}`
  return "Заказ"
})
const currency = computed(() => order.value?.currency_code || "rub")
const shipping = computed(() => {
  const value = Number(order.value?.shipping)
  return Number.isFinite(value) && value > 0 ? value : null
})

function price(value) {
  return formatPrice(value, currency.value)
}

function linePrice(item) {
  return price(item.total ?? item.unit_price)
}

function orderApiPath(number) {
  const value = String(number || "").replace(/\D/g, "")
  const token = access.value
  const path = `${BACKEND_URL}/store/shop-orders/${encodeURIComponent(value)}`
  return token ? `${path}?t=${encodeURIComponent(token)}` : path
}

async function load(number, quiet = false) {
  const value = String(number || "").replace(/\D/g, "")
  if (!/^\d{10}$/.test(value)) {
    order.value = null
    error.value = value ? "Номер заказа — 10 цифр." : ""
    return
  }
  if (!quiet) {
    loading.value = true
    error.value = ""
  }
  try {
    const res = await fetch(orderApiPath(value), { headers: storeHeaders() })
    if (!res.ok) {
      if (!quiet) {
        order.value = null
        error.value = "Заказ не найден."
      }
      return
    }
    const data = await res.json()
    if (!alive) return
    order.value = data.order
    if (!quiet) {
      writeEmail.value = ""
      writeMessage.value = ""
      writeError.value = ""
      writeDone.value = false
    }
  } catch {
    order.value = null
    error.value = "Не удалось загрузить заказ."
  } finally {
    loading.value = false
  }
}

async function pollDelivery() {
  const number = String(order.value?.number || numberParam.value)
  for (let attempt = 0; attempt < 8; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 1500))
    if (!alive) return
    await load(number, true)
    if (order.value?.can_track || order.value?.ozon_point_name) return
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
      `${BACKEND_URL}/store/shop-orders/${encodeURIComponent(order.value.number)}/message${
        access.value ? `?t=${encodeURIComponent(access.value)}` : ""
      }`,
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

onMounted(async () => {
  alive = true
  await load(numberParam.value)
  if (justPaid.value && order.value) pollDelivery()
})
onBeforeUnmount(() => {
  alive = false
})
watch([numberParam, access], async () => {
  query.value = numberParam.value
  await load(numberParam.value)
  if (justPaid.value && order.value) pollDelivery()
})
</script>

<template>
  <article class="checkout-done">
    <h1>{{ heading }}</h1>
    <form v-if="!order && !loading" class="order-lookup" @submit="onLookup">
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
      <p v-if="justPaid" class="checkout-done-id">{{ order.number }}</p>
      <p class="muted">{{ order.status?.label }}</p>
      <p v-if="order.cancel_reason" class="muted">{{ order.cancel_reason }}</p>
      <p v-if="order.cancel_note" class="muted" style="white-space: pre-wrap">
        {{ order.cancel_note }}
      </p>

      <section v-if="order.items?.length" class="checkout-done-block">
        <div v-for="(item, index) in order.items" :key="index" class="line">
          <LineProduct :item="item">
            <div>
              <div class="card-title">{{ item.title }}</div>
              <p class="muted">{{ item.quantity }} шт.</p>
            </div>
            <div v-if="linePrice(item)" class="card-meta">
              {{ linePrice(item) }}
            </div>
          </LineProduct>
        </div>
        <div v-if="shipping != null || order.total != null" class="totals">
          <div v-if="shipping != null">
            <span>Доставка</span>
            <span>{{ price(shipping) }}</span>
          </div>
          <p v-if="order.total != null" class="checkout-total">
            <span>Итого</span>
            <span>{{ price(order.total) }}</span>
          </p>
        </div>
      </section>

      <section
        v-if="order.ozon_point_name || order.can_track || justPaid"
        class="checkout-done-block"
      >
        <p v-if="order.ozon_point_name">{{ order.ozon_point_name }}</p>
        <p v-if="order.can_track">
          <a href="https://www.ozon.ru/my/orderlist" target="_blank" rel="noreferrer">
            Отследить на Ozon
          </a>
        </p>
        <p v-else-if="justPaid" class="muted">Отправление появится через минуту.</p>
      </section>

      <section v-if="canWrite" class="checkout-done-block">
        <h2>Написать о заказе</h2>
        <p class="muted">
          Форма для брака и ошибки после получения. Кнопки «вернуть» нет —
          напишите, разберём по почте.
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
