<script setup>
import { onMounted, ref, watch } from "vue"
import ProductCell from "./ProductCell.vue"
import { loadLuckyProduct } from "../lib/sdk.js"

const props = defineProps({
  banner: { type: Object, required: true },
  excludeId: { type: String, default: "" },
})

const product = ref(null)

async function load() {
  product.value = await loadLuckyProduct(props.excludeId)
}

onMounted(load)
watch(() => [props.excludeId, props.banner?.id], load)
</script>

<template>
  <section v-if="product" class="banner banner-lucky">
    <div class="banner-copy">
      <h2 class="banner-title">{{ banner.title }}</h2>
      <p class="banner-body">{{ banner.body }}</p>
    </div>
    <div class="banner-lucky-card">
      <ProductCell :product="product" />
    </div>
  </section>
</template>
