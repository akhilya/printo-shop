<script setup>
import { computed, ref, watch } from "vue"
import { useRoute } from "vue-router"
import CatalogNav from "../components/CatalogNav.vue"
import Pager from "../components/Pager.vue"
import ProductCell from "../components/ProductCell.vue"
import { sortInStockFirst } from "../lib/product-stock.js"
import {
  PAGE_SIZE,
  listShopCatalog,
  sdk,
} from "../lib/sdk.js"

const route = useRoute()
const products = ref([])
const categories = ref([])
const count = ref(0)
const loading = ref(true)
const error = ref("")

const q = computed(() =>
  typeof route.query.q === "string" ? route.query.q.trim() : ""
)
const cat = computed(() =>
  typeof route.query.c === "string" ? route.query.c : ""
)
const page = computed(() => {
  const n = Number(route.query.page)
  return Number.isInteger(n) && n > 1 ? n : 1
})
const pages = computed(() => Math.max(1, Math.ceil(count.value / PAGE_SIZE)))

function catalogQuery(nextPage, overrides = {}) {
  const query = {}
  const nextQ = overrides.q !== undefined ? overrides.q : q.value
  const nextC = overrides.c !== undefined ? overrides.c : cat.value
  if (nextQ) query.q = nextQ
  if (nextC) query.c = nextC
  if (nextPage > 1) query.page = String(nextPage)
  return { path: "/products", query }
}

async function load() {
  loading.value = true
  error.value = ""
  try {
    const offset = (page.value - 1) * PAGE_SIZE
    const [productRes, catRes] = await Promise.all([
      listShopCatalog({
        q: q.value,
        categoryId: cat.value,
        limit: PAGE_SIZE,
        offset,
      }),
      sdk.store.category.list({ limit: 20, include_descendants_tree: false }),
    ])
    products.value = sortInStockFirst(productRes.products || [])
    count.value = productRes.count || 0
    categories.value = catRes.product_categories || []
    window.scrollTo(0, 0)
  } catch {
    error.value = "Не удалось загрузить каталог."
    products.value = []
    count.value = 0
  } finally {
    loading.value = false
  }
}

watch([q, cat, page], load, { immediate: true })
</script>

<template>
  <div>
    <CatalogNav :categories="categories" />
    <h1 class="page-title">Товары</h1>
    <p v-if="loading" class="empty">Загрузка</p>
    <p v-else-if="error" class="err">{{ error }}</p>
    <p v-else-if="!products.length && q" class="empty">
      Ничего не нашли по запросу «{{ q }}»
    </p>
    <p v-else-if="!products.length" class="empty">Товаров нет</p>
    <template v-else>
      <div class="grid">
        <ProductCell v-for="p in products" :key="p.id" :product="p" />
      </div>
      <Pager :page="page" :pages="pages" :href-for="catalogQuery" />
    </template>
  </div>
</template>
