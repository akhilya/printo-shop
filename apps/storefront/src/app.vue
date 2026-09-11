<script setup>
import { onMounted, ref } from "vue"
import SiteHeader from "./components/SiteHeader.vue"
import CartDrawer from "./components/CartDrawer.vue"
import { loadCart } from "./lib/cart.js"
import { legalPages, loadLegalPages } from "./lib/legal.js"
import { loadCatalogSales } from "./lib/sales.js"
import { loadShopStatus, shopState } from "./lib/shop.js"

const ready = ref(false)

onMounted(async () => {
  try {
    await loadShopStatus()
  } catch {
    shopState.closed = false
    shopState.ordersClosed = false
  }
  ready.value = true
  if (shopState.closed) return
  await loadCart()
  loadLegalPages()
  loadCatalogSales()
})
</script>

<template>
  <div v-if="!ready" class="closed" />
  <div v-else-if="shopState.closed" class="closed">
    <p>{{ shopState.message }}</p>
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
        <router-link to="/order">Заказ</router-link>
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
