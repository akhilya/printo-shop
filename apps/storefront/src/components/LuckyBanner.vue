<script setup>
import { ref, watch } from "vue"
import ProductCell from "./ProductCell.vue"
import { loadLuckyProduct } from "../lib/sdk.js"

const props = defineProps({
  banner: { type: Object, required: true },
  excludeId: { type: String, default: "" },
  product: { type: Object, default: null },
})

const card = ref(null)

async function load() {
  if (props.product?.id || props.product?.handle) {
    card.value = props.product
    return
  }
  card.value = await loadLuckyProduct(props.excludeId)
}

watch(
  () => [props.excludeId, props.banner?.id, props.product?.id],
  load,
  { immediate: true }
)
</script>

<template>
  <section v-if="card" class="banner banner-lucky">
    <div class="banner-copy">
      <h2 class="banner-title">{{ banner.title }}</h2>
      <p class="banner-body">{{ banner.body }}</p>
    </div>
    <div class="banner-lucky-card">
      <ProductCell :product="card" />
    </div>
  </section>
</template>
