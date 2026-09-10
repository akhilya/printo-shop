<script setup>
import { onMounted, ref } from "vue"
import CatalogNav from "../components/CatalogNav.vue"
import GroupCard from "../components/GroupCard.vue"
import { listShopGroups, sdk } from "../lib/sdk.js"

const groups = ref([])
const categories = ref([])
const loading = ref(true)
const error = ref("")

onMounted(async () => {
  loading.value = true
  error.value = ""
  try {
    const [nextGroups, catRes] = await Promise.all([
      listShopGroups(),
      sdk.store.category.list({ limit: 20, include_descendants_tree: false }),
    ])
    groups.value = nextGroups
    categories.value = catRes.product_categories || []
  } catch {
    error.value = "Не удалось загрузить коллекции"
    groups.value = []
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div>
    <CatalogNav :categories="categories" />
    <h1 class="page-title">Коллекции</h1>
    <p v-if="loading" class="empty">Загрузка</p>
    <p v-else-if="error" class="err">{{ error }}</p>
    <p v-else-if="!groups.length" class="empty">Коллекций пока нет</p>
    <div v-else class="grid">
      <GroupCard v-for="g in groups" :key="g.id" :group="g" />
    </div>
  </div>
</template>
