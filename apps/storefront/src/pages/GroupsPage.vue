<script setup>
import { onMounted, ref } from "vue"
import { bindPageBusy } from "../lib/page-busy.js"
import CatalogNav from "../components/CatalogNav.vue"
import GroupCard from "../components/GroupCard.vue"
import { listShopCategories, listShopGroups } from "../lib/sdk.js"

const groups = ref([])
const categories = ref([])
const loading = ref(true)
const error = ref("")
bindPageBusy(loading)

onMounted(async () => {
  loading.value = true
  error.value = ""
  try {
    const [nextGroups, nextCategories] = await Promise.all([
      listShopGroups(),
      listShopCategories(),
    ])
    groups.value = nextGroups
    categories.value = nextCategories
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
    <p v-if="!loading && error" class="err">{{ error }}</p>
    <p v-else-if="!loading && !groups.length" class="empty">Коллекций пока нет</p>
    <div v-else-if="!loading" class="grid">
      <GroupCard v-for="g in groups" :key="g.id" :group="g" />
    </div>
  </div>
</template>
