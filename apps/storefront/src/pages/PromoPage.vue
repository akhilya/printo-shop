<script setup>
import { computed, ref, watch } from "vue"
import { useRoute } from "vue-router"
import LinkArrow from "../components/LinkArrow.vue"
import { rememberShopPromo } from "../lib/cart.js"
import { bindPageBusy } from "../lib/page-busy.js"
import { applyShopSeo } from "../lib/seo-head.js"
import { BACKEND_URL, formatPrice, storeHeaders } from "../lib/sdk.js"

const route = useRoute()
const loading = ref(true)
bindPageBusy(loading)
const promo = ref(null)
const failed = ref(false)
const copied = ref(false)

const page = computed(() => String(route.params.page || "").trim())

const offer = computed(() => {
  const row = promo.value
  if (!row || row.ended) return ""
  const scope = row.include_shipping ? "на заказ с доставкой" : "на товары"
  if (row.type === "fixed") return `${formatPrice(row.value, "rub")} ${scope}`
  return `${row.value}% ${scope}`
})

async function load() {
  loading.value = true
  failed.value = false
  promo.value = null
  copied.value = false
  const value = page.value
  if (!value) {
    loading.value = false
    return
  }
  try {
    const res = await fetch(
      `${BACKEND_URL}/store/shop-page/${encodeURIComponent(value)}`,
      { headers: storeHeaders() }
    )
    if (!res.ok) throw new Error("promo")
    const data = await res.json()
    promo.value = data.promo || null
    if (promo.value?.code && !promo.value.ended) {
      rememberShopPromo(promo.value.code)
    }
  } catch {
    failed.value = true
  } finally {
    loading.value = false
    applyShopSeo({
      path: route.path,
      title: offer.value || "Акция",
      description: promo.value?.code
        ? "Промокод для заказа на сайте."
        : "Такой акции нет.",
      robots: "noindex, nofollow",
    })
  }
}

async function copyCode() {
  const value = promo.value?.code
  if (!value) return
  try {
    await navigator.clipboard.writeText(value)
    copied.value = true
  } catch {
    copied.value = false
  }
}

watch(page, load, { immediate: true })
</script>

<template>
  <article v-if="!loading" class="promo-page">
    <template v-if="promo && !promo.ended">
      <h1>{{ offer }}</h1>
      <p>Промокод для заказа на сайте.</p>
      <p class="promo-code">{{ promo.code }}</p>
      <button class="btn" type="button" @click="copyCode">
        {{ copied ? "Скопировано" : "Скопировать" }}
      </button>
      <router-link class="btn" to="/products">
        К покупкам
        <LinkArrow />
      </router-link>
    </template>
    <h1 v-else-if="promo?.ended">Акция закончилась</h1>
    <h1 v-else-if="failed">Не удалось открыть акцию.</h1>
    <h1 v-else>Такой акции нет</h1>
  </article>
</template>
