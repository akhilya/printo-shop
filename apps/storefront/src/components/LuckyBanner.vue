<script setup>
import { computed, ref, watch } from "vue"
import { useRouter } from "vue-router"
import ProductCell from "./ProductCell.vue"
import { loadLuckyProduct, loadLuckyProducts } from "../lib/sdk.js"

const props = defineProps({
  banner: { type: Object, required: true },
  excludeId: { type: String, default: "" },
  product: { type: Object, default: null },
  products: { type: Array, default: null },
})

const router = useRouter()
const cards = ref([])
const rolling = ref(false)

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

async function roll() {
  if (rolling.value) return
  rolling.value = true
  try {
    const product = await loadLuckyProduct(props.excludeId)
    const handle = product?.handle
    if (handle) await router.push(`/p/${handle}`)
  } finally {
    rolling.value = false
  }
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
      <p v-if="banner.body" class="banner-body">{{ banner.body }}</p>
      <button
        type="button"
        class="btn lucky-roll"
        :disabled="rolling"
        @click="roll"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect x="3" y="3" width="18" height="18" />
          <path d="M9 3v18M15 3v18M3 9h18M3 15h18" />
        </svg>
        Случайный товар
      </button>
    </div>
    <div class="banner-lucky-cards">
      <ProductCell v-for="card in shown" :key="card.id || card.handle" :product="card" />
    </div>
  </section>
</template>
