<script setup>
import { computed, ref, watch } from "vue"
import ProductCell from "./ProductCell.vue"
import { loadLuckyProducts } from "../lib/sdk.js"

const props = defineProps({
  banner: { type: Object, required: true },
  excludeId: { type: String, default: "" },
  product: { type: Object, default: null },
  products: { type: Array, default: null },
})

const cards = ref([])

const shown = computed(() => cards.value.slice(0, 3))

async function load() {
  const seeded = Array.isArray(props.products)
    ? props.products.filter((row) => row?.id || row?.handle).slice(0, 3)
    : []
  if (seeded.length) {
    cards.value = seeded
    return
  }
  if (props.product?.id || props.product?.handle) {
    cards.value = [props.product]
    return
  }
  cards.value = await loadLuckyProducts(props.excludeId, 3)
}

watch(
  () => [props.excludeId, props.banner?.id, props.product?.id, props.products],
  load,
  { immediate: true }
)
</script>

<template>
  <section v-if="shown.length" class="banner banner-lucky">
    <div class="banner-copy">
      <h2 class="banner-title">{{ banner.title }}</h2>
      <p class="banner-body">{{ banner.body }}</p>
    </div>
    <div class="rail-track">
      <ProductCell v-for="card in shown" :key="card.id || card.handle" :product="card" />
    </div>
  </section>
</template>
