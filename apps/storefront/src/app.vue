<script setup>
import { onMounted, ref } from "vue"
import SiteHeader from "./components/SiteHeader.vue"
import CartDrawer from "./components/CartDrawer.vue"
import { BACKEND_URL, storeHeaders } from "./lib/sdk.js"
import { loadCart } from "./lib/cart.js"
import { legalPages, loadLegalPages } from "./lib/legal.js"
import { loadCatalogSales } from "./lib/sales.js"

const ready = ref(false)
const closed = ref(false)
const closedMessage = ref("Магазин в разработке.")

onMounted(async () => {
  try {
    const res = await fetch(`${BACKEND_URL}/store/shop-status`, {
      headers: storeHeaders(),
    })
    if (res.ok) {
      const data = await res.json()
      closed.value = data.shop?.closed === true
      if (data.shop?.message) closedMessage.value = data.shop.message
    }
  } catch {
    closed.value = false
  }
  ready.value = true
  if (closed.value) return
  loadCart()
  loadLegalPages()
  loadCatalogSales()
})
</script>

<template>
  <div v-if="!ready" class="closed" />
  <div v-else-if="closed" class="closed">
    <p>{{ closedMessage }}</p>
  </div>
  <div v-else class="site">
    <SiteHeader />
    <main class="main">
      <router-view />
    </main>
    <footer class="footer">
      <div class="bar footer-links">
        <router-link to="/products">Товары</router-link>
        <router-link to="/collections">Коллекции</router-link>
        <router-link to="/custom-order">Индивидуальный заказ</router-link>
        <router-link
          v-for="page in legalPages"
          :key="page.slug"
          :to="`/${page.slug}`"
        >
          {{ page.title }}
        </router-link>
      </div>
    </footer>
    <CartDrawer />
  </div>
</template>
