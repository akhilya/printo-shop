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
const title = ref("")
const categories = ref([])
const products = ref([])
const count = ref(0)
const loading = ref(true)
const error = ref("")

const page = computed(() => {
  const n = Number(route.query.page)
  return Number.isInteger(n) && n > 1 ? n : 1
})
const pages = computed(() => Math.max(1, Math.ceil(count.value / PAGE_SIZE)))

function pageQuery(nextPage) {
  return nextPage > 1 ? { page: String(nextPage) } : {}
}

async function resolveGroup(id) {
  const { collection } = await sdk.store.collection.retrieve(id, {
    fields: "id,title",
  })
  return {
    title: collection.title,
    query: { collection_id: collection.id },
  }
}

async function load() {
  loading.value = true
  error.value = ""
  title.value = ""
  try {
    const group = await resolveGroup(route.params.id)
    title.value = group.title
    const offset = (page.value - 1) * PAGE_SIZE
    const [productRes, catRes] = await Promise.all([
      listShopCatalog({
        collectionId: group.query.collection_id,
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
    error.value = "Коллекция не найдена"
    products.value = []
    count.value = 0
  } finally {
    loading.value = false
  }
}

watch(() => [route.params.id, page.value], load, { immediate: true })
</script>

<template>
  <div>
    <CatalogNav :categories="categories" />
    <h1 v-if="title" class="page-title">{{ title }}</h1>
    <p v-if="loading" class="empty">Загрузка</p>
    <p v-else-if="error" class="err">{{ error }}</p>
    <p v-else-if="!products.length" class="empty">Товаров нет</p>
    <template v-else>
      <div class="grid">
        <ProductCell v-for="p in products" :key="p.id" :product="p" />
      </div>
      <Pager
        :page="page"
        :pages="pages"
        :href-for="(n) => ({ path: route.path, query: pageQuery(n) })"
      />
    </template>
  </div>
</template>
