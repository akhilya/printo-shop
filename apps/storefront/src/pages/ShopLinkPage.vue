<script setup>
import { ref, watch } from "vue"
import { useRoute, useRouter } from "vue-router"
import { bindPageBusy } from "../lib/page-busy.js"
import { shopState } from "../lib/shop.js"

const route = useRoute()
const router = useRouter()
const waiting = ref(true)
bindPageBusy(waiting)

watch(
  () => [route.path, shopState.redirectPath, shopState.redirectTarget],
  () => {
    const path = shopState.redirectPath
    const target = shopState.redirectTarget
    if (path && target && route.path === path) {
      router.replace(target)
      return
    }
    waiting.value = false
  },
  { immediate: true }
)
</script>

<template>
  <article v-if="!waiting" class="promo-page">
    <h1>Такой страницы нет</h1>
  </article>
</template>
