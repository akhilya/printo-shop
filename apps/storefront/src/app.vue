<script setup>
import { nextTick, onMounted, ref } from "vue"
import ConfirmDialog from "./components/ConfirmDialog.vue"
import PageScrim from "./components/PageScrim.vue"
import SiteHeader from "./components/SiteHeader.vue"
import CartDrawer from "./components/CartDrawer.vue"
import {
  acceptAdult,
  adultPrompt,
  declineAdult,
} from "./lib/adult-gate.js"
import { shopAnalyticsReady, startShopAnalytics } from "./lib/analytics.js"
import { hydrateCartLater } from "./lib/cart.js"
import {
  legalDocumentPages,
  legalPages,
  loadLegalPages,
  usefulExtraPages,
} from "./lib/legal.js"
import { loadCatalogSales } from "./lib/sales.js"
import { holdPage, pageBusy } from "./lib/page-busy.js"
import { loadShopStatus, shopState } from "./lib/shop.js"

const ready = ref(false)
const releaseBoot = holdPage()

onMounted(async () => {
  try {
    await loadShopStatus()
  } catch {
    shopState.closed = false
    shopState.ordersClosed = false
  }
  shopAnalyticsReady()
  ready.value = true
  await nextTick()
  releaseBoot()
  if (shopState.closed) return
  startShopAnalytics()
  hydrateCartLater()
  loadLegalPages()
  loadCatalogSales()
})
</script>

<template>
  <Teleport to="body">
    <PageScrim v-if="pageBusy" />
  </Teleport>
  <div v-if="!ready" class="closed" />
  <div v-else-if="shopState.closed" class="closed">
    <p>{{ shopState.message }}</p>
  </div>
  <div v-else class="site" :inert="pageBusy">
    <SiteHeader />
    <main class="main">
      <router-view />
    </main>
    <footer class="footer">
      <div class="bar footer-grid">
        <nav class="footer-col" aria-label="Магазин">
          <p class="footer-label">Магазин</p>
          <div class="footer-links">
            <router-link to="/products">Товары</router-link>
            <router-link to="/collections">Коллекции</router-link>
            <router-link to="/custom-order">Индивидуальный заказ</router-link>
            <router-link to="/gift-cards">Подарочные сертификаты</router-link>
            <router-link to="/order">Заказ</router-link>
            <router-link
              v-for="page in usefulExtraPages(legalPages)"
              :key="page.slug"
              :to="`/${page.slug}`"
            >
              {{ page.title }}
            </router-link>
          </div>
        </nav>
        <nav class="footer-col" aria-label="Документы">
          <p class="footer-label">Документы</p>
          <div class="footer-links">
            <router-link
              v-for="page in legalDocumentPages(legalPages)"
              :key="page.slug"
              :to="`/${page.slug}`"
            >
              {{ page.title }}
            </router-link>
          </div>
        </nav>
      </div>
    </footer>
    <CartDrawer />
    <ConfirmDialog
      v-if="adultPrompt"
      title="18+"
      confirm-label="Мне есть 18"
      @confirm="acceptAdult"
      @close="declineAdult"
    >
      <p>Товар для взрослых. Подтвердите, что вам есть 18 лет.</p>
    </ConfirmDialog>
  </div>
</template>
