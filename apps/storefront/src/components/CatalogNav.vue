<script setup>
import { computed } from "vue"
import { useRoute } from "vue-router"

defineProps({
  categories: { type: Array, default: () => [] },
})

const route = useRoute()
const q = computed(() =>
  typeof route.query.q === "string" ? route.query.q.trim() : ""
)
const cat = computed(() =>
  typeof route.query.c === "string" ? route.query.c : ""
)
const onGroups = computed(() => route.path === "/collections")
const onProducts = computed(() => route.path === "/products")

function productsQuery(overrides = {}) {
  const query = {}
  if (q.value) query.q = q.value
  const nextC = overrides.c !== undefined ? overrides.c : cat.value
  if (nextC) query.c = nextC
  return query
}
</script>

<template>
  <ul class="cats">
    <li>
      <router-link
        :to="{ path: '/products', query: productsQuery({ c: '' }) }"
        :aria-current="onProducts && !cat ? 'page' : undefined"
      >
        Товары
      </router-link>
    </li>
    <li>
      <router-link
        to="/collections"
        :aria-current="onGroups ? 'page' : undefined"
      >
        Коллекции
      </router-link>
    </li>
    <li v-for="c in categories" :key="c.id">
      <router-link
        :to="{ path: '/products', query: productsQuery({ c: c.id }) }"
        :aria-current="onProducts && cat === c.id ? 'page' : undefined"
      >
        {{ c.name }}
      </router-link>
    </li>
  </ul>
</template>
