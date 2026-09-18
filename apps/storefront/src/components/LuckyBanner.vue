<script setup>
import { computed, onMounted, ref, watch } from "vue"
import SiteBanner from "./SiteBanner.vue"
import { loadLuckyProduct } from "../lib/sdk.js"

const props = defineProps({
  banner: { type: Object, required: true },
  excludeId: { type: String, default: "" },
})

const product = ref(null)

const display = computed(() => {
  const item = product.value
  if (!item?.handle) return null
  return {
    ...props.banner,
    cta_href: `/p/${item.handle}`,
    cta_label: props.banner.cta_label || "Мне повезёт",
    image_url: props.banner.image_url || item.thumbnail,
  }
})

async function load() {
  product.value = await loadLuckyProduct(props.excludeId)
}

onMounted(load)
watch(() => [props.excludeId, props.banner?.id], load)
</script>

<template>
  <SiteBanner v-if="display" :banner="display" />
</template>
