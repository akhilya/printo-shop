<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue"
import { useRoute } from "vue-router"
import ProductPhoto from "../components/ProductPhoto.vue"
import PromoField from "../components/PromoField.vue"
import PvzPicker from "../components/PvzPicker.vue"
import {
  cartState,
  cartTotals,
  linePrices,
  loadCart,
  removeLine,
  setQty,
} from "../lib/cart.js"
import { persistObject } from "../lib/persist.js"
import {
  BACKEND_URL,
  formatPrice,
  sdk,
  shopError,
  storeHeaders,
} from "../lib/sdk.js"
import { legalPages, LEGAL_FALLBACK } from "../lib/legal.js"
import { shopState, loadShopStatus } from "../lib/shop.js"
import { visibleCheckoutShipping } from "../lib/checkout-shipping.js"

const route = useRoute()
const token = computed(() => String(route.params.token || ""))
const isCustom = computed(() => Boolean(token.value))

const busy = ref(false)
const error = ref("")
const legalAccepted = ref(false)
const consentPages = computed(() =>
  (legalPages.value.length ? legalPages.value : LEGAL_FALLBACK).filter(
    (page) => page.enabled !== false
  )
)
const quotedShipping = ref(null)
const shippingQuoteFailed = ref(false)
let quoteTimer = 0
let statusTimer = 0
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
  const itemsAmount = custom.value.items_amount || custom.value.amount || 0
  const discount = custom.value.discount_amount || 0
  return [
    {
      id: custom.value.product_id || "custom",
      title: custom.value.title,
      thumbnail:
        custom.value.product_thumbnail || custom.value.image_urls?.[0] || "",
      quantity: 1,
      original_total: itemsAmount,
      total: Math.max(0, itemsAmount - discount),
      unit_price: Math.max(0, itemsAmount - discount),
    },
  ]
})

const currency = computed(() =>
  isCustom.value
    ? custom.value?.currency || "rub"
    : cartState.cart?.currency_code || "rub"
)

const totals = computed(() => {
  if (isCustom.value) {
    return {
      items: custom.value?.items_amount || custom.value?.amount || 0,
      discount: custom.value?.discount_amount || 0,
      shipping: custom.value?.shipping_amount || 0,
      other: custom.value?.other_amount || 0,
      total: custom.value?.amount || 0,
    }
  }
  const base = cartTotals(cartState.cart)
  const shipping = visibleCheckoutShipping({
    quoteMode: shopState.ozonQuoteMode,
    quoted: quotedShipping.value,
    cartShipping: base.shipping,
    shopFixedAmount: shopState.ozonFixedAmount,
  })
  const total = Math.max(0, base.items - base.discount + shipping)
  return { ...base, shipping, total }
})

const showPvz = computed(
  () => !isCustom.value || custom.value?.client_picks_pvz === true
)

const pvzChosen = computed(() => Boolean(form.ozon_point_id))

const shippingLabel = computed(() => {
  if (totals.value.shipping) {
    return formatPrice(totals.value.shipping, currency.value)
  }
  if (!showPvz.value) return formatPrice(0, currency.value)
  if (!pvzChosen.value) return "После выбора ПВЗ"
  if (
    shopState.ozonQuoteMode !== "fixed" &&
    !String(form.phone || "").replace(/\D/g, "")
  ) {
    return "Укажите телефон, чтобы посчитать доставку"
  }
  if (shippingQuoteFailed.value) return "Не удалось посчитать доставку"
  return "Считаем доставку…"
})

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
  await loadShopStatus()
  statusTimer = window.setInterval(() => {
    loadShopStatus()
  }, 2500)
  window.addEventListener("visibilitychange", loadShopStatus)
  window.addEventListener("focus", loadShopStatus)
  if (!token.value) {
    await loadCart()
    if (form.ozon_point_id) await quoteShipping()
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

onBeforeUnmount(() => {
  clearInterval(statusTimer)
  window.removeEventListener("visibilitychange", loadShopStatus)
  window.removeEventListener("focus", loadShopStatus)
})

watch(
  () => [shopState.ozonQuoteMode, shopState.ozonFixedAmount],
  () => {
    if (shopState.ozonQuoteMode === "fixed") {
      shippingQuoteFailed.value = false
    }
    if (form.ozon_point_id) quoteShipping()
  }
)

function pointCity(address) {
  const text = String(address || "")
  const match = text.match(
    /(г\.|город|пос\.|пгт|д\.|дер\.|село)\s*([^,]+)/i
  )
  if (match) return match[2].trim()
  return text.split(",")[0]?.trim() || "Россия"
}

async function quoteShipping(point = {
  id: form.ozon_point_id,
  address: form.ozon_point_address,
  lat: Number(form.ozon_point_lat),
  lon: Number(form.ozon_point_lon),
}) {
  if (isCustom.value || !cartState.cart?.id || !point.id) return
  shippingQuoteFailed.value = false
  try {
    const res = await fetch(`${BACKEND_URL}/store/ozon/quote`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...storeHeaders(),
      },
      body: JSON.stringify({
        cart_id: cartState.cart.id,
        point_id: point.id,
        point_address: point.address,
        lat: Number.isFinite(point.lat) ? point.lat : undefined,
        lon: Number.isFinite(point.lon) ? point.lon : undefined,
        phone: form.phone,
      }),
    })
    const data = await res.json().catch(() => ({}))
    const amount = Number(data.amount)
    if (res.ok && amount > 0) {
      quotedShipping.value = amount
      shippingQuoteFailed.value = false
    } else if (shopState.ozonQuoteMode === "fixed") {
      quotedShipping.value = shopState.ozonFixedAmount || null
      shippingQuoteFailed.value = false
    } else {
      quotedShipping.value = null
      shippingQuoteFailed.value = true
    }
    if (res.ok) await loadCart()
  } catch {
    if (shopState.ozonQuoteMode === "fixed") {
      shippingQuoteFailed.value = false
      return
    }
    quotedShipping.value = null
    shippingQuoteFailed.value = true
  }
}

async function onPvz(point) {
  form.ozon_point_id = String(point.id)
  form.ozon_point_name = point.name || ""
  form.ozon_point_address = point.address || ""
  form.ozon_point_lat = String(point.lat || "")
  form.ozon_point_lon = String(point.lon || "")
  form.address_1 = point.address || ""
  form.city = point.city || form.city
  error.value = ""
  quotedShipping.value = null
  await quoteShipping({
    id: String(point.id),
    address: point.address,
    lat: Number(point.lat),
    lon: Number(point.lon),
  })
}

watch(
  () => form.phone,
  () => {
    if (!pvzChosen.value) return
    clearTimeout(quoteTimer)
    quoteTimer = setTimeout(() => {
      quoteShipping()
    }, 400)
  }
)

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
      ozon_shipping_amount: quotedShipping.value,
      legal_accepted: true,
      legal_accepted_at: new Date().toISOString(),
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
  if (form.ozon_point_id) {
    await fetch(`${BACKEND_URL}/store/ozon/quote`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...storeHeaders(),
      },
      body: JSON.stringify({
        cart_id: cart.id,
        point_id: form.ozon_point_id,
        point_address: form.ozon_point_address,
        phone: form.phone,
      }),
    })
    const fresh = await sdk.store.cart.retrieve(cart.id)
    cart = fresh.cart
  }
  const { payment_collection } = await sdk.store.payment.initiatePaymentSession(
    cart,
    {
      provider_id: "pp_tbank_tbank",
      data: {
        cart_id: cart.id,
        email: form.email,
        phone: form.phone,
        legal_accepted: true,
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
        legal_accepted: true,
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
  if (!legalAccepted.value) {
    error.value = "Примите условия магазина"
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
  if (
    showPvz.value &&
    !shopState.ozonConfigured &&
    shopState.ozonQuoteMode !== "fixed"
  ) {
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
              <span
                v-if="linePrices(item).onSale"
                class="price-was"
              >{{ formatPrice(linePrices(item).original, currency) }}</span>
              {{ formatPrice(linePrices(item).current, currency) }}
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
        <PromoField
          :token="isCustom ? token : ''"
          :promo-code="custom?.promo_code || ''"
          @applied="custom = $event"
        />
        <div class="totals">
          <div>
            <span>Товары</span>
            <span>{{ formatPrice(totals.items, currency) }}</span>
          </div>
          <div v-if="totals.discount">
            <span>Скидка</span>
            <span>−{{ formatPrice(totals.discount, currency) }}</span>
          </div>
          <div v-if="showPvz || totals.shipping">
            <span>Доставка</span>
            <span>{{ shippingLabel }}</span>
          </div>
          <div v-if="totals.other">
            <span>Ещё</span>
            <span>{{ formatPrice(totals.other, currency) }}</span>
          </div>
          <div class="checkout-total">
            <span>Итого</span>
            <span>{{ formatPrice(totals.total, currency) }}</span>
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
        <label class="check">
          <input v-model="legalAccepted" type="checkbox" required />
          <span>
            Оформляя заказ, принимаю
            <template v-for="(page, index) in consentPages" :key="page.slug">
              <router-link :to="`/${page.slug}`" target="_blank">{{
                page.title.toLowerCase()
              }}</router-link>
              <template v-if="index < consentPages.length - 2">, </template>
              <template v-else-if="index === consentPages.length - 2">
                и
              </template>
            </template>.
          </span>
        </label>
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
