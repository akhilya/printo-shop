<script setup>
import { computed, onMounted, ref } from "vue"
import { useRoute } from "vue-router"
import ProductPhoto from "../components/ProductPhoto.vue"
import PromoField from "../components/PromoField.vue"
import PvzPicker from "../components/PvzPicker.vue"
import { cartState, loadCart, removeLine, setQty } from "../lib/cart.js"
import { persistObject } from "../lib/persist.js"
import {
  BACKEND_URL,
  formatPrice,
  sdk,
  shopError,
  storeHeaders,
} from "../lib/sdk.js"
import { shopState } from "../lib/shop.js"

const route = useRoute()
const token = computed(() => String(route.params.token || ""))
const isCustom = computed(() => Boolean(token.value))

const busy = ref(false)
const error = ref("")
const custom = ref(null)
const customLoading = ref(false)
const form = persistObject("shop_checkout", {
  email: "",
  first_name: "",
  last_name: "",
  phone: "",
  address_1: "",
  city: "",
  postal_code: "",
  ozon_point_id: "",
  ozon_point_name: "",
  ozon_point_address: "",
  ozon_point_lat: "",
  ozon_point_lon: "",
})

const items = computed(() => {
  if (!isCustom.value) return cartState.cart?.items || []
  if (!custom.value) return []
  return [
    {
      id: custom.value.product_id || "custom",
      title: custom.value.title,
      thumbnail:
        custom.value.product_thumbnail || custom.value.image_urls?.[0] || "",
      unit_price: custom.value.amount,
      quantity: 1,
    },
  ]
})

const currency = computed(() =>
  isCustom.value
    ? custom.value?.currency || "rub"
    : cartState.cart?.currency_code || "rub"
)

const total = computed(() =>
  isCustom.value ? custom.value?.amount : cartState.cart?.total
)

const showPvz = computed(
  () => !isCustom.value || custom.value?.client_picks_pvz === true
)

const extraPhotos = computed(() => {
  if (!custom.value) return []
  const main =
    custom.value.product_thumbnail || custom.value.image_urls?.[0] || ""
  return (custom.value.image_urls || []).filter((url) => url && url !== main)
})

const details = computed(() => {
  if (!custom.value) return []
  const note = String(custom.value.quote_note || "").trim()
  const message = String(custom.value.message || "").trim()
  const blocks = []
  if (note) blocks.push(note)
  if (message && message !== note) blocks.push(message)
  return blocks
})

onMounted(async () => {
  if (!token.value) {
    await loadCart()
    return
  }
  customLoading.value = true
  try {
    const res = await fetch(
      `${BACKEND_URL}/store/custom-checkout/${encodeURIComponent(token.value)}`,
      { headers: storeHeaders() }
    )
    if (!res.ok) throw new Error("not_found")
    const data = await res.json()
    custom.value = data.checkout
    if (custom.value?.paid) {
      window.location.replace(`/custom-order/pay/${token.value}/success`)
      return
    }
    if (custom.value?.email && !form.email) form.email = custom.value.email
    if (custom.value?.phone && !form.phone) form.phone = custom.value.phone
    if (custom.value?.name && !form.first_name) {
      const parts = String(custom.value.name).trim().split(/\s+/)
      form.first_name = parts[0] || ""
      if (!form.last_name) form.last_name = parts.slice(1).join(" ")
    }
  } catch {
    custom.value = null
  } finally {
    customLoading.value = false
  }
})

function pointCity(address) {
  const text = String(address || "")
  const match = text.match(
    /(г\.|город|пос\.|пгт|д\.|дер\.|село)\s*([^,]+)/i
  )
  if (match) return match[2].trim()
  return text.split(",")[0]?.trim() || "Россия"
}

function onPvz(point) {
  form.ozon_point_id = String(point.id)
  form.ozon_point_name = point.name || ""
  form.ozon_point_address = point.address || ""
  form.ozon_point_lat = String(point.lat || "")
  form.ozon_point_lon = String(point.lon || "")
  form.address_1 = point.address || ""
  form.city = point.city || form.city
  error.value = ""
}

async function payCart() {
  const address = {
    first_name: form.first_name,
    last_name: form.last_name,
    phone: form.phone,
    address_1: form.ozon_point_address || form.address_1,
    address_2: form.ozon_point_name,
    company: form.ozon_point_id,
    city: form.city || pointCity(form.ozon_point_address),
    postal_code: form.postal_code || "000000",
    country_code: "ru",
  }
  let { cart } = await sdk.store.cart.update(cartState.cart.id, {
    email: form.email,
    shipping_address: address,
    billing_address: address,
    metadata: {
      ozon_point_id: form.ozon_point_id,
      ozon_point_name: form.ozon_point_name,
      ozon_point_address: form.ozon_point_address,
      ozon_point_lat: form.ozon_point_lat,
      ozon_point_lon: form.ozon_point_lon,
    },
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
      data: {
        cart_id: cart.id,
        email: form.email,
        phone: form.phone,
      },
    }
  )
  const sessions = payment_collection?.payment_sessions || []
  const session =
    sessions.find((item) => item.provider_id === "pp_tbank_tbank") ||
    sessions[0]
  const payUrl = session?.data?.PaymentURL
  if (!payUrl) throw new Error("pay_failed")
  window.location.href = String(payUrl)
}

async function payCustom() {
  const res = await fetch(
    `${BACKEND_URL}/store/custom-checkout/${encodeURIComponent(token.value)}/pay`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...storeHeaders(),
      },
      body: JSON.stringify({
        name: [form.first_name, form.last_name].filter(Boolean).join(" "),
        email: form.email,
        phone: form.phone,
        ozon_point_id: form.ozon_point_id,
        ozon_point_name: form.ozon_point_name,
        ozon_point_address: form.ozon_point_address,
      }),
    }
  )
  const data = await res.json().catch(() => ({}))
  if (!res.ok || !data.payment_url) {
    throw new Error(data.message || "pay_failed")
  }
  window.location.href = String(data.payment_url)
}

async function submit(event) {
  event.preventDefault()
  if (shopState.ordersClosed) {
    error.value = shopState.ordersMessage
    return
  }
  if (showPvz.value && !form.ozon_point_id) {
    error.value = "Выберите пункт выдачи Ozon"
    document.querySelector(".pvz")?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    })
    return
  }
  if (showPvz.value && !shopState.ozonConfigured) {
    error.value = "Ozon Доставка ещё не подключена"
    return
  }
  if (!isCustom.value && !cartState.cart?.id) {
    error.value = "Корзина пуста"
    return
  }
  busy.value = true
  error.value = ""
  try {
    if (isCustom.value) await payCustom()
    else await payCart()
  } catch (e) {
    error.value = shopError(e, "Не удалось оформить заказ")
  } finally {
    busy.value = false
  }
}

const empty = computed(() => {
  if (isCustom.value) return !customLoading.value && !custom.value
  return !cartState.cart?.items?.length
})
</script>

<template>
  <div class="checkout">
    <h1 class="product-title">Оформление</h1>
    <p v-if="customLoading" class="muted">Загрузка</p>
    <p v-else-if="empty" class="empty">
      {{ isCustom ? "Ссылка недействительна или ещё не сформирована." : "Корзина пуста" }}
    </p>
    <form v-else class="checkout-layout" @submit="submit">
      <div class="checkout-items">
        <h2>Заказ</h2>
        <div v-for="item in items" :key="item.id" class="line">
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
              {{ formatPrice(item.unit_price ?? item.subtotal, currency) }}
            </div>
            <div v-if="!isCustom" class="qty">
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
        <p
          v-for="(block, index) in details"
          :key="index"
          class="muted"
          style="white-space: pre-wrap"
        >
          {{ block }}
        </p>
        <div v-if="extraPhotos.length" class="custom-pay-photos">
          <div v-for="url in extraPhotos" :key="url" class="matte">
            <ProductPhoto :src="url" alt="" />
          </div>
        </div>
        <p v-if="!isCustom && cartState.error" class="err">{{ cartState.error }}</p>
        <PromoField v-if="!isCustom" />
        <div class="totals">
          <div v-if="!isCustom">
            <span>Товары</span>
            <span>{{ formatPrice(cartState.cart.item_subtotal ?? cartState.cart.subtotal, currency) }}</span>
          </div>
          <div v-if="!isCustom && cartState.cart.discount_total">
            <span>Скидка</span>
            <span>−{{ formatPrice(cartState.cart.discount_total, currency) }}</span>
          </div>
          <div class="checkout-total">
            <span>Итого</span>
            <span>{{ formatPrice(total, currency) }}</span>
          </div>
        </div>
      </div>
      <div class="form checkout-fields">
        <label>Email <input v-model="form.email" type="email" required /></label>
        <label>Имя <input v-model="form.first_name" required /></label>
        <label>Фамилия <input v-model="form.last_name" required /></label>
        <label>Телефон <input v-model="form.phone" type="tel" required /></label>
      </div>
      <div class="checkout-pvz">
        <PvzPicker
          v-if="showPvz"
          :phone="form.phone"
          :selected-id="form.ozon_point_id"
          @select="onPvz"
        />
        <p v-if="showPvz && form.ozon_point_id" class="muted">
          ПВЗ: {{ form.ozon_point_name }}. {{ form.ozon_point_address }}
        </p>
        <p v-if="shopState.ordersClosed" class="muted">{{ shopState.ordersMessage }}</p>
        <p v-if="error" class="err">{{ error }}</p>
        <button
          class="btn"
          type="submit"
          :disabled="busy || cartState.busy || shopState.ordersClosed"
        >
          Оплатить
        </button>
      </div>
    </form>
  </div>
</template>
