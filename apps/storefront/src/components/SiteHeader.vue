<script setup>
import { ShoppingCart } from "@lucide/vue"
import { ref, watch } from "vue"
import { useRoute, useRouter } from "vue-router"
import { itemCount, openCart } from "../lib/cart.js"

const route = useRoute()
const router = useRouter()
const q = ref(typeof route.query.q === "string" ? route.query.q : "")

watch(
  () => route.query.q,
  (value) => {
    q.value = typeof value === "string" ? value : ""
  }
)

function onSearch(event) {
  event.preventDefault()
  const query = q.value.trim()
  router.push({ path: "/products", query: query ? { q: query } : {} })
}
</script>

<template>
  <header class="header">
    <div class="bar">
      <form class="search" role="search" @submit="onSearch">
        <input
          v-model="q"
          type="search"
          name="q"
          placeholder="Название, артикул или характеристики"
          aria-label="Поиск по названию, артикулу или характеристикам"
        />
      </form>
      <router-link class="brand" to="/" aria-label="PrintO.studio — на главную">
        <img
          class="logo-wide"
          src="/logo-wide.webp"
          alt="PrintO.studio"
          width="280"
          height="40"
        />
      </router-link>
      <button
        class="cart-btn"
        type="button"
        :aria-label="itemCount() ? `Корзина (${itemCount()})` : 'Корзина'"
        @click="openCart"
      >
        <ShoppingCart :size="20" :stroke-width="1.5" />
        <span v-if="itemCount()" class="cart-count">{{ itemCount() }}</span>
      </button>
    </div>
  </header>
</template>
