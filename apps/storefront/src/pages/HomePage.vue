<script setup>
import { onMounted, ref } from "vue"
import { useRoute, useRouter } from "vue-router"
import GroupCard from "../components/GroupCard.vue"
import ProductCell from "../components/ProductCell.vue"
import LinkArrow from "../components/LinkArrow.vue"
import LuckyBanner from "../components/LuckyBanner.vue"
import SiteBanner from "../components/SiteBanner.vue"
import { productInStock } from "../lib/product-stock.js"
import {
  HOME_GROUPS,
  HOME_PRODUCTS,
  BACKEND_URL,
  listShopCatalog,
  listShopGroups,
  storeHeaders,
} from "../lib/sdk.js"

const route = useRoute()
const router = useRouter()
const groups = ref([])
const products = ref([])
const banners = ref([])
const loading = ref(true)
const error = ref("")

function bannerBySlot(slot) {
  return banners.value.find((item) => item.slot === slot) || null
}

async function loadBanners() {
  const res = await fetch(`${BACKEND_URL}/store/banners`, {
    headers: storeHeaders(),
  })
  if (!res.ok) return []
  const data = await res.json()
  return data.banners || []
}

function redirectLegacyCatalog() {
  const query = {}
  if (typeof route.query.q === "string" && route.query.q.trim()) {
    query.q = route.query.q.trim()
  }
  if (typeof route.query.c === "string" && route.query.c) {
    query.c = route.query.c
  }
  if (route.query.page) query.page = route.query.page
  if (query.q || query.c || query.page) {
    router.replace({ path: "/products", query })
    return true
  }
  return false
}

onMounted(async () => {
  if (redirectLegacyCatalog()) return
  loading.value = true
  error.value = ""
  try {
    const [groupsResult, productsResult, bannersResult] = await Promise.allSettled([
      listShopGroups(),
      listShopCatalog({ limit: HOME_PRODUCTS, offset: 0, inStock: true }),
      loadBanners(),
    ])
    groups.value =
      groupsResult.status === "fulfilled"
        ? (groupsResult.value || []).slice(0, HOME_GROUPS)
        : []
    products.value =
      productsResult.status === "fulfilled"
        ? (productsResult.value.products || []).filter(productInStock)
        : []
    banners.value =
      bannersResult.status === "fulfilled" ? bannersResult.value : []
    if (
      groupsResult.status === "rejected" &&
      productsResult.status === "rejected"
    ) {
      error.value = "Не удалось загрузить каталог."
    }
  } catch {
    error.value = "Не удалось загрузить каталог."
    groups.value = []
    products.value = []
    banners.value = []
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div class="home">
    <h1 class="visually-hidden">PrintO.studio</h1>
    <p v-if="loading" class="empty">Загрузка</p>
    <template v-else>
      <SiteBanner
        v-if="bannerBySlot('home_hero')"
        :banner="bannerBySlot('home_hero')"
      />
      <p v-if="error" class="err">{{ error }}</p>
      <section v-if="groups.length" class="home-block">
        <div class="section-head">
          <h2 class="section-title">Коллекции</h2>
          <router-link class="section-more" to="/collections">Все коллекции<LinkArrow /></router-link>
        </div>
        <div class="grid">
          <GroupCard v-for="g in groups" :key="g.id" :group="g" />
        </div>
      </section>

      <section v-if="products.length" class="home-block">
        <div class="section-head">
          <h2 class="section-title">Товары</h2>
          <router-link class="section-more" to="/products">Все товары<LinkArrow /></router-link>
        </div>
        <div class="grid">
          <ProductCell v-for="p in products" :key="p.id" :product="p" />
        </div>
      </section>

      <LuckyBanner
        v-if="bannerBySlot('home_lucky')"
        :banner="bannerBySlot('home_lucky')"
      />
      <SiteBanner
        v-if="bannerBySlot('home_catalog')"
        :banner="bannerBySlot('home_catalog')"
      />
      <SiteBanner
        v-if="bannerBySlot('home_custom')"
        :banner="bannerBySlot('home_custom')"
      />
      <SiteBanner
        v-if="bannerBySlot('home_order')"
        :banner="bannerBySlot('home_order')"
      />
      <p v-if="!groups.length && !products.length" class="empty">
        Товаров нет
      </p>
    </template>
  </div>
</template>
