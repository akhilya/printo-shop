<script setup>
import { computed, ref, watch } from "vue"
import { useRoute } from "vue-router"
import CatalogNav from "../components/CatalogNav.vue"
import Pager from "../components/Pager.vue"
import ProductCell from "../components/ProductCell.vue"
import { sortInStockFirst } from "../lib/product-stock.js"
import { applyShopSeo } from "../lib/seo-head.js"
import { SHOP_NAME, shopAbsoluteUrl, shopCanonicalPath } from "../lib/seo.js"
import {
  PAGE_SIZE,
  listShopCatalog,
  listShopCategories,
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
    const collectionId = String(route.params.id || "")
    const offset = (page.value - 1) * PAGE_SIZE
    const [group, productRes, nextCategories] = await Promise.all([
      resolveGroup(collectionId),
      listShopCatalog({
        collectionId,
        limit: PAGE_SIZE,
        offset,
      }),
      listShopCategories(),
    ])
    title.value = group.title
    products.value = sortInStockFirst(productRes.products || [])
    count.value = productRes.count || 0
    categories.value = nextCategories
    window.scrollTo(0, 0)
  } catch {
    error.value = "Коллекция не найдена"
    products.value = []
    count.value = 0
  } finally {
    loading.value = false
    const origin = window.location.origin
    applyShopSeo({
      path: route.path,
      query: { page: page.value > 1 ? String(page.value) : "" },
      title: title.value || "Коллекция",
      description: title.value
        ? `Фигурки из коллекции ${title.value}.`
        : "Коллекция фигурок PrintO.studio.",
      robots: error.value ? "noindex, follow" : undefined,
      crumbs: [
        { name: SHOP_NAME, path: "/" },
        { name: "Коллекции", path: "/collections" },
        title.value
          ? { name: title.value, path: route.path }
          : null,
      ].filter(Boolean),
      prev:
        page.value > 1
          ? shopAbsoluteUrl(
              origin,
              shopCanonicalPath(route.path, { page: String(page.value - 1) })
            )
          : "",
      next:
        page.value < pages.value
          ? shopAbsoluteUrl(
              origin,
              shopCanonicalPath(route.path, { page: String(page.value + 1) })
            )
          : "",
    })
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
